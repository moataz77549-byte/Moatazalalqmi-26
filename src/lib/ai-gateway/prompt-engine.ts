import { ChatMessage } from './types';
import { countMessageTokens } from './token-counter';

export interface ContextSources {
  systemPrompt?: string;
  projectContext?: string;
  conversationContext?: string;
  memoryContext?: string;
  knowledgeBaseContext?: string;
  fileContext?: string;
  userInstructions?: string;
}

export interface PromptBuildResult {
  messages: ChatMessage[];
  tokenCount: number;
  compressed: boolean;
  truncatedSources: string[];
}

const MAX_CONTEXT_TOKENS = 120000; // Conservative limit to leave room for response

export async function buildPrompt(
  userMessages: ChatMessage[],
  context: ContextSources,
  maxTokens: number = MAX_CONTEXT_TOKENS
): Promise<PromptBuildResult> {
  const truncatedSources: string[] = [];
  let compressed = false;

  // Build system prompt with all context
  const systemParts: string[] = [];

  if (context.systemPrompt) {
    systemParts.push(context.systemPrompt);
  }

  if (context.projectContext) {
    systemParts.push(`## Project Context\n${context.projectContext}`);
  }

  if (context.memoryContext) {
    systemParts.push(`## Relevant Memory\n${context.memoryContext}`);
  }

  if (context.knowledgeBaseContext) {
    systemParts.push(`## Knowledge Base\n${context.knowledgeBaseContext}`);
  }

  if (context.conversationContext) {
    systemParts.push(`## Previous Conversation Summary\n${context.conversationContext}`);
  }

  if (context.fileContext) {
    systemParts.push(`## File Context\n${context.fileContext}`);
  }

  if (context.userInstructions) {
    systemParts.push(`## User Instructions\n${context.userInstructions}`);
  }

  let systemMessage: ChatMessage | null = null;
  if (systemParts.length > 0) {
    let systemContent = systemParts.join('\n\n---\n\n');

    // Check token count and compress if needed
    let systemTokens = await countMessageTokens([{ role: 'system', content: systemContent }]);
    const userTokens = await countMessageTokens(userMessages);

    if (systemTokens + userTokens > maxTokens) {
      compressed = true;
      // Compress by truncating the largest context source first
      const sources = [
        { name: 'knowledgeBase', content: context.knowledgeBaseContext },
        { name: 'memory', content: context.memoryContext },
        { name: 'file', content: context.fileContext },
        { name: 'project', content: context.projectContext },
        { name: 'conversation', content: context.conversationContext },
      ].filter((s) => s.content);

      for (const source of sources) {
        if (systemTokens + userTokens <= maxTokens) break;

        // Find and truncate this source in the system content
        const sourceStart = systemContent.indexOf(source.content!);
        if (sourceStart >= 0) {
          const maxSourceLength = Math.floor(source.content!.length * 0.5);
          const truncated =
            source.content!.substring(0, maxSourceLength) + '\n[...truncated...]';
          systemContent =
            systemContent.substring(0, sourceStart) +
            truncated +
            systemContent.substring(sourceStart + source.content!.length);
          truncatedSources.push(source.name);
          systemTokens = await countMessageTokens([{ role: 'system', content: systemContent }]);
        }
      }
    }

    systemMessage = { role: 'system', content: systemContent };
  }

  const finalMessages = systemMessage ? [systemMessage, ...userMessages] : userMessages;
  const tokenCount = await countMessageTokens(finalMessages);

  return {
    messages: finalMessages,
    tokenCount,
    compressed,
    truncatedSources,
  };
}

export function extractUserInstructions(messages: ChatMessage[]): string | undefined {
  // Look for instructions in the first user message
  for (const msg of messages) {
    if (msg.role === 'user' && typeof msg.content === 'string') {
      // Detect instruction patterns
      const instructionPatterns = [
        /^(?:as|act as|you are|pretend to be)/i,
        /^(?:instructions?:?|rules?:?|guidelines?:?)/i,
        /^(?:please|kindly|make sure|ensure)/i,
      ];

      const contentStr = typeof msg.content === 'string' ? msg.content : '';
      if (instructionPatterns.some((p) => p.test(contentStr.trim()))) {
        return contentStr;
      }
    }
  }
  return undefined;
}

export function summarizeConversation(messages: ChatMessage[], maxTokens: number = 500): string {
  // Simple summarization: keep first user message, last 3 messages, and key terms
  if (messages.length <= 4) return '';
  // maxTokens is reserved for a future smarter summarizer (e.g. LLM-based).
  // For now we use a deterministic substring heuristic and ignore the budget.
  void maxTokens;

  const firstUserMsg = messages.find((m) => m.role === 'user');
  const recentMessages = messages.slice(-3);

  const parts: string[] = [];
  if (firstUserMsg) {
    const content = typeof firstUserMsg.content === 'string' ? firstUserMsg.content : '';
    parts.push(`Initial request: ${content.substring(0, 200)}`);
  }

  parts.push('Recent messages:');
  for (const msg of recentMessages) {
    const content = typeof msg.content === 'string' ? msg.content : '';
    parts.push(`[${msg.role}]: ${content.substring(0, 150)}`);
  }

  return parts.join('\n');
}
