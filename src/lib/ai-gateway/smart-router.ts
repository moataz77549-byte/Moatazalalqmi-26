import { modelRegistry } from './registry';
import { isProviderAvailable } from './health-monitor';
import { ChatRequest, ModelInfo, ProviderType, TaskType } from './types';
import { countMessageTokens } from './token-counter';

export interface RoutingContext {
  taskType: TaskType;
  priority: 'cost' | 'latency' | 'quality' | 'balanced';
  preferredProvider?: ProviderType;
  excludedProviders?: ProviderType[];
  minContextWindow?: number;
  requiresVision?: boolean;
  requiresAudio?: boolean;
  requiresToolCalling?: boolean;
  requiresJsonMode?: boolean;
  requiresThinking?: boolean;
  requiresStreaming?: boolean;
  subscriptionPlan?: 'free' | 'pro' | 'enterprise';
  userPreferences?: {
    preferredModels?: string[];
    avoidedModels?: string[];
  };
}

export interface RoutingDecision {
  model: ModelInfo;
  reason: string;
  alternatives: ModelInfo[];
}

export async function routeRequest(
  request: ChatRequest,
  context: RoutingContext
): Promise<RoutingDecision> {
  // Step 1: Filter models by required capabilities
  let candidates = modelRegistry.filterModels({
    supportsVision: context.requiresVision,
    supportsStreaming: context.requiresStreaming,
    supportsToolCalling: context.requiresToolCalling,
    supportsJsonMode: context.requiresJsonMode,
    supportsThinking: context.requiresThinking,
    minContextWindow: context.minContextWindow,
    status: 'active',
  });

  // Step 2: Filter by content length
  const estimatedTokens = await countMessageTokens(request.messages);
  candidates = candidates.filter(
    (m) => m.contextWindow >= estimatedTokens + (request.maxTokens || 1000)
  );

  // Step 3: Filter by provider availability
  candidates = candidates.filter((m) => isProviderAvailable(m.providerType));

  // Step 4: Filter by user preferences
  if (context.preferredProvider) {
    const preferred = candidates.filter((m) => m.providerType === context.preferredProvider);
    if (preferred.length > 0) candidates = preferred;
  }

  if (context.excludedProviders?.length) {
    candidates = candidates.filter(
      (m) => !context.excludedProviders!.includes(m.providerType)
    );
  }

  if (context.userPreferences?.avoidedModels?.length) {
    candidates = candidates.filter(
      (m) => !context.userPreferences!.avoidedModels!.includes(m.externalId)
    );
  }

  // Step 5: Filter by subscription plan (free users get cheaper models)
  if (context.subscriptionPlan === 'free') {
    candidates = candidates.filter((m) => m.pricing.inputPer1k <= 0.001);
  }

  // Step 6: Filter by task type
  candidates = candidates.filter((m) => {
    if (context.taskType === 'vision' && !m.supportsVision) return false;
    if (context.taskType === 'audio' && !m.supportsAudio) return false;
    if (context.taskType === 'reasoning' && !m.supportsThinking) return false;
    if (
      context.taskType === 'code' &&
      !m.capabilities.includes('code') &&
      !m.supportsToolCalling
    )
      return false;
    return true;
  });

  if (candidates.length === 0) {
    throw new Error('No suitable models available for the request');
  }

  // Step 7: Score and rank candidates
  const scored = candidates.map((m) => ({
    model: m,
    score: scoreModel(m, context),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Step 8: Return top choice with alternatives
  const top = scored[0];
  const alternatives = scored.slice(1, 4).map((s) => s.model);

  let reason = `Selected based on ${context.priority} priority`;
  if (context.preferredProvider && top.model.providerType === context.preferredProvider) {
    reason = `Preferred provider ${context.preferredProvider} with best ${context.priority} match`;
  }

  return {
    model: top.model,
    reason,
    alternatives,
  };
}

function scoreModel(model: ModelInfo, context: RoutingContext): number {
  let score = 0;

  // Normalize cost (lower cost = higher score)
  const costPer1k = model.pricing.inputPer1k + model.pricing.outputPer1k;
  const costScore = costPer1k === 0 ? 100 : Math.max(0, 100 - costPer1k * 1000);

  // Latency score (lower latency = higher score)
  const latencyScore = model.avgLatency ? Math.max(0, 100 - model.avgLatency / 100) : 50;

  // Quality heuristics (larger context = higher quality potential)
  const qualityScore = Math.min(100, model.contextWindow / 2000);

  switch (context.priority) {
    case 'cost':
      score = costScore * 0.7 + qualityScore * 0.2 + latencyScore * 0.1;
      break;
    case 'latency':
      score = latencyScore * 0.7 + costScore * 0.2 + qualityScore * 0.1;
      break;
    case 'quality':
      score = qualityScore * 0.7 + costScore * 0.15 + latencyScore * 0.15;
      break;
    case 'balanced':
      score = costScore * 0.33 + latencyScore * 0.33 + qualityScore * 0.34;
      break;
  }

  // Bonus for preferred provider
  if (context.preferredProvider === model.providerType) {
    score += 20;
  }

  // Bonus for preferred models
  if (context.userPreferences?.preferredModels?.includes(model.externalId)) {
    score += 15;
  }

  return score;
}

export function extractRoutingContext(
  request: ChatRequest,
  userId: string,
  subscriptionPlan: string = 'free'
): RoutingContext {
  // Detect vision requirement
  const hasVision = request.messages.some((msg) => {
    if (typeof msg.content !== 'string' && Array.isArray(msg.content)) {
      return msg.content.some((part) => part.type === 'image_url' || part.type === 'image');
    }
    return false;
  });

  // Detect task type from message content
  const lastMessage = request.messages[request.messages.length - 1];
  const content = typeof lastMessage?.content === 'string' ? lastMessage.content : '';
  const contentLower = content.toLowerCase();

  let taskType: TaskType = 'chat';
  if (hasVision) taskType = 'vision';
  else if (
    contentLower.includes('code') ||
    contentLower.includes('function') ||
    contentLower.includes('class')
  )
    taskType = 'code';
  else if (
    contentLower.includes('explain') ||
    contentLower.includes('analyze') ||
    contentLower.includes('reason')
  )
    taskType = 'reasoning';
  else if (contentLower.includes('summarize') || contentLower.includes('summary'))
    taskType = 'summary';

  return {
    taskType,
    priority: request.priority || 'balanced',
    preferredProvider: request.preferredProvider,
    requiresVision: hasVision,
    requiresToolCalling: !!request.tools?.length,
    requiresJsonMode:
      request.responseFormat === 'json_object' || request.responseFormat === 'json_schema',
    requiresStreaming: request.stream || false,
    subscriptionPlan: subscriptionPlan as 'free' | 'pro' | 'enterprise',
  };
}
