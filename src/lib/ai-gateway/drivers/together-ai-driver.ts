import { OpenAICompatibleDriver } from './openai-compatible-driver';
import { ModelInfo, ProviderType } from '../types';

const TOGETHER_MODELS: ModelInfo[] = [
  {
    providerId: 'together',
    providerType: 'TOGETHER_AI' as ProviderType,
    externalId: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    displayName: 'Llama 3.3 70B Turbo',
    contextWindow: 131072,
    maxOutputTokens: 8192,
    supportsVision: false,
    supportsAudio: false,
    supportsStreaming: true,
    supportsToolCalling: true,
    supportsJsonMode: true,
    supportsThinking: false,
    pricing: { inputPer1k: 0.00088, outputPer1k: 0.00088, currency: 'USD' },
    status: 'active',
    capabilities: ['chat', 'tools', 'json', 'streaming'],
  },
  {
    providerId: 'together',
    providerType: 'TOGETHER_AI' as ProviderType,
    externalId: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
    displayName: 'Llama 3.1 405B Turbo',
    contextWindow: 131072,
    maxOutputTokens: 8192,
    supportsVision: false,
    supportsAudio: false,
    supportsStreaming: true,
    supportsToolCalling: true,
    supportsJsonMode: true,
    supportsThinking: false,
    pricing: { inputPer1k: 0.005, outputPer1k: 0.005, currency: 'USD' },
    status: 'active',
    capabilities: ['chat', 'tools', 'json', 'streaming'],
  },
  {
    providerId: 'together',
    providerType: 'TOGETHER_AI' as ProviderType,
    externalId: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
    displayName: 'Qwen 2.5 72B Turbo',
    contextWindow: 32768,
    maxOutputTokens: 8192,
    supportsVision: false,
    supportsAudio: false,
    supportsStreaming: true,
    supportsToolCalling: true,
    supportsJsonMode: true,
    supportsThinking: false,
    pricing: { inputPer1k: 0.00088, outputPer1k: 0.00088, currency: 'USD' },
    status: 'active',
    capabilities: ['chat', 'tools', 'json', 'streaming'],
  },
  {
    providerId: 'together',
    providerType: 'TOGETHER_AI' as ProviderType,
    externalId: 'deepseek-ai/DeepSeek-V3',
    displayName: 'DeepSeek V3 (via Together)',
    contextWindow: 64000,
    maxOutputTokens: 8192,
    supportsVision: false,
    supportsAudio: false,
    supportsStreaming: true,
    supportsToolCalling: true,
    supportsJsonMode: true,
    supportsThinking: false,
    pricing: { inputPer1k: 0.00027, outputPer1k: 0.0011, currency: 'USD' },
    status: 'active',
    capabilities: ['chat', 'tools', 'json', 'streaming'],
  },
];

export class TogetherAIDriver extends OpenAICompatibleDriver {
  constructor() {
    super('TOGETHER_AI' as ProviderType, 'https://api.together.xyz/v1', TOGETHER_MODELS);
  }
}
