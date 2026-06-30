import { providerRegistry, modelRegistry } from './registry';
import { routeRequest, extractRoutingContext } from './smart-router';
import { buildFallbackChain, isFallbackEligible } from './fallback-engine';
import { withRetry } from './retry-engine';
import { getCachedResponse, setCachedResponse, shouldCache } from './prompt-cache';
import { recordUsage } from './usage-tracker';
import { checkProviderHealth, getAllProviderHealth } from './health-monitor';
import { buildPrompt, ContextSources } from './prompt-engine';
import {
  ChatRequest,
  ChatResponse,
  StreamChunk,
  EmbeddingRequest,
  EmbeddingResponse,
  ModelInfo,
  ProviderType,
  ProviderConfig,
  GatewayError,
  HealthStatus,
} from './types';

export interface GatewayOptions {
  userId: string;
  organizationId?: string;
  subscriptionPlan?: string;
  enableCache?: boolean;
  enableFallback?: boolean;
  enableRetry?: boolean;
  context?: ContextSources;
  maxRetries?: number;
  maxFallbacks?: number;
}

const DEFAULT_OPTIONS: Partial<GatewayOptions> = {
  enableCache: true,
  enableFallback: true,
  enableRetry: true,
  maxRetries: 3,
  maxFallbacks: 3,
  subscriptionPlan: 'free',
};

class AIGateway {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    // Provider registry auto-initializes on import
    this.initialized = true;
  }

  async chat(request: ChatRequest, options: GatewayOptions): Promise<ChatResponse> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    await this.initialize();

    // Step 1: Build prompt with context
    let finalMessages = request.messages;
    if (opts.context) {
      const built = await buildPrompt(request.messages, opts.context);
      finalMessages = built.messages;
      request = { ...request, messages: finalMessages };
    }

    // Step 2: Check cache
    if (opts.enableCache && shouldCache(request.model, request.messages, request.temperature)) {
      const cached = await getCachedResponse(request.model, request.messages, {
        temperature: request.temperature,
        maxTokens: request.maxTokens,
      });
      if (cached) {
        return {
          id: `cached_${Date.now()}`,
          model: request.model,
          provider: 'CUSTOM',
          content: cached,
          finishReason: 'stop',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          cost: { prompt: 0, completion: 0, total: 0, currency: 'USD' },
          latency: 0,
          providerMetadata: { cached: true },
        };
      }
    }

    // Step 3: Smart routing
    const routingContext = extractRoutingContext(request, opts.userId, opts.subscriptionPlan);
    let primaryModel: ModelInfo;
    let alternatives: ModelInfo[] = [];

    try {
      const routing = await routeRequest(request, routingContext);
      primaryModel = routing.model;
      alternatives = routing.alternatives;
    } catch (error) {
      throw new GatewayError('No suitable model available', 'NO_MODEL_AVAILABLE', error as Error);
    }

    // Step 4: Build fallback chain
    let fallbackChain;
    if (opts.enableFallback) {
      fallbackChain = buildFallbackChain(primaryModel, request, opts.maxFallbacks);
    } else {
      fallbackChain = { primary: primaryModel, fallbacks: [], reason: 'Fallback disabled' };
    }

    // Step 5: Execute with retry and fallback
    const startTime = Date.now();
    let lastError: Error | null = null;
    let attempts = 0;
    let fallbackUsed = 0;
    let response: ChatResponse | null = null;

    const allModels = [fallbackChain.primary, ...fallbackChain.fallbacks];

    for (let i = 0; i < allModels.length; i++) {
      const model = allModels[i];
      const driver = providerRegistry.getDriver(model.providerType);

      if (!driver) {
        continue;
      }

      attempts++;

      try {
        const executeRequest = async () => {
          const requestForModel = { ...request, model: model.externalId };
          return await driver.chat(requestForModel);
        };

        if (opts.enableRetry) {
          response = await withRetry(executeRequest, { maxRetries: opts.maxRetries });
        } else {
          response = await executeRequest();
        }

        fallbackUsed = i;
        break;
      } catch (error) {
        lastError = error as Error;

        if (i < allModels.length - 1 && isFallbackEligible(error)) {
          continue;
        }

        throw new GatewayError(
          `All providers failed. Last error: ${lastError.message}`,
          'ALL_PROVIDERS_FAILED',
          lastError
        );
      }
    }

    if (!response) {
      throw new GatewayError(
        `No response from any provider. Last error: ${lastError?.message}`,
        'NO_RESPONSE',
        lastError || undefined
      );
    }

    // Step 6: Record usage
    await recordUsage({
      userId: opts.userId,
      organizationId: opts.organizationId,
      provider: response.provider,
      model: response.model,
      taskType: routingContext.taskType,
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      totalTokens: response.usage.totalTokens,
      cost: response.cost.total,
      latency: response.latency,
      success: true,
      retries: attempts - 1,
      fallbacks: fallbackUsed,
    });

    // Step 7: Cache response
    if (opts.enableCache && shouldCache(request.model, request.messages, request.temperature)) {
      await setCachedResponse(
        request.model,
        request.messages,
        {
          temperature: request.temperature,
          maxTokens: request.maxTokens,
        },
        response.content
      );
    }

    // startTime is captured for future per-request latency telemetry hooks.
    // It is intentionally retained even though response.latency is used above.
    void startTime;
    void alternatives;

    return response;
  }

  async *stream(
    request: ChatRequest,
    options: GatewayOptions
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    await this.initialize();

    // Build prompt with context
    if (opts.context) {
      const built = await buildPrompt(request.messages, opts.context);
      request = { ...request, messages: built.messages };
    }

    // Smart routing
    const routingContext = extractRoutingContext(request, opts.userId, opts.subscriptionPlan);
    let primaryModel: ModelInfo;

    try {
      const routing = await routeRequest(request, routingContext);
      primaryModel = routing.model;
    } catch (error) {
      throw new GatewayError('No suitable model available', 'NO_MODEL_AVAILABLE', error as Error);
    }

    // Build fallback chain
    const fallbackChain = opts.enableFallback
      ? buildFallbackChain(primaryModel, request, opts.maxFallbacks)
      : { primary: primaryModel, fallbacks: [], reason: 'disabled' };

    const allModels = [fallbackChain.primary, ...fallbackChain.fallbacks];
    let lastError: Error | null = null;

    for (let i = 0; i < allModels.length; i++) {
      const model = allModels[i];
      const driver = providerRegistry.getDriver(model.providerType);

      if (!driver) continue;

      try {
        const requestForModel = { ...request, model: model.externalId };
        const generator = driver.stream(requestForModel);

        let totalContent = '';
        let usage: Partial<ChatResponse['usage']> | null = null;

        for await (const chunk of generator) {
          if (chunk.delta) totalContent += chunk.delta;
          if (chunk.usage) usage = chunk.usage;
          yield chunk;
        }

        // Record usage for successful stream
        await recordUsage({
          userId: opts.userId,
          organizationId: opts.organizationId,
          provider: model.providerType,
          model: model.externalId,
          taskType: routingContext.taskType,
          promptTokens: usage?.promptTokens || 0,
          completionTokens: usage?.completionTokens || 0,
          totalTokens: usage?.totalTokens || 0,
          cost: 0, // Cost calculated post-stream in production
          latency: 0,
          streamingDuration: 0,
          success: true,
          retries: 0,
          fallbacks: i,
        });

        void totalContent;
        return;
      } catch (error) {
        lastError = error as Error;
        if (i < allModels.length - 1 && isFallbackEligible(error)) {
          continue;
        }
        throw new GatewayError(
          `Stream failed across all providers. Last error: ${lastError.message}`,
          'STREAM_FAILED',
          lastError
        );
      }
    }

    throw new GatewayError('No streaming response', 'NO_STREAM', lastError || undefined);
  }

  async embeddings(
    request: EmbeddingRequest,
    options: GatewayOptions
  ): Promise<EmbeddingResponse> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    await this.initialize();

    // Find the model
    const model = modelRegistry.findModel(request.model);
    if (!model) {
      throw new GatewayError(`Model not found: ${request.model}`, 'MODEL_NOT_FOUND');
    }

    const driver = providerRegistry.getDriver(model.providerType);
    if (!driver) {
      throw new GatewayError(
        `Provider not available: ${model.providerType}`,
        'PROVIDER_NOT_FOUND'
      );
    }

    const startTime = Date.now();

    try {
      const response = opts.enableRetry
        ? await withRetry(() => driver.embeddings(request), {
            maxRetries: opts.maxRetries,
          })
        : await driver.embeddings(request);

      await recordUsage({
        userId: opts.userId,
        organizationId: opts.organizationId,
        provider: response.provider,
        model: response.model,
        taskType: 'embedding',
        promptTokens: response.usage.promptTokens,
        completionTokens: 0,
        totalTokens: response.usage.totalTokens,
        cost: response.cost.total,
        latency: response.latency,
        success: true,
        retries: 0,
        fallbacks: 0,
      });

      return response;
    } catch (error) {
      await recordUsage({
        userId: opts.userId,
        organizationId: opts.organizationId,
        provider: model.providerType,
        model: request.model,
        taskType: 'embedding',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cost: 0,
        latency: Date.now() - startTime,
        success: false,
        errorMessage: (error as Error).message,
        retries: 0,
        fallbacks: 0,
      });
      throw error;
    }
  }

  async getProviderHealth(): Promise<HealthStatus[]> {
    return getAllProviderHealth();
  }

  async checkProvider(providerType: ProviderType): Promise<HealthStatus> {
    const driver = providerRegistry.getDriver(providerType);
    if (!driver) {
      return {
        provider: providerType,
        status: 'unknown',
        latency: 0,
        lastChecked: new Date(0),
        errorRate: 1,
        consecutiveErrors: 0,
      };
    }
    return checkProviderHealth(driver);
  }

  listProviders(): ProviderType[] {
    return providerRegistry.getAllProviders();
  }

  listModels(provider?: ProviderType): ModelInfo[] {
    if (provider) {
      return modelRegistry.getModelsByProvider(provider);
    }
    return modelRegistry.getAllModels();
  }

  async configureProvider(config: ProviderConfig): Promise<void> {
    await providerRegistry.initializeProvider(config);
  }
}

// Singleton
export const aiGateway = new AIGateway();

// Re-export routing types for ergonomic external consumption
export type { RoutingContext } from './smart-router';
