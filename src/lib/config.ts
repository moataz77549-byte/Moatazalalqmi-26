/**
 * Configuration System
 *
 * Design principle: The application MUST start even if optional services are unavailable.
 * Only DATABASE_URL is truly required. Everything else degrades gracefully.
 *
 * Missing optional services → disable feature, log warning, continue startup.
 */

function requiredEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string = ''): string {
  return process.env[key] || defaultValue;
}

function optionalInt(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// Warn about missing optional services at startup (non-blocking)
function warnIfMissing(key: string, service: string, feature: string): void {
  if (!process.env[key]) {
    console.warn(`[Config] ${service} not configured (${key} missing). Feature "${feature}" will be disabled.`);
  }
}

// Log startup warnings (runs once on module load)
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
  warnIfMissing('REDIS_URL', 'Redis', 'caching/queues');
  warnIfMissing('QDRANT_URL', 'Qdrant', 'vector search');
  warnIfMissing('S3_ENDPOINT', 'S3 Storage', 'file storage');
  warnIfMissing('JWT_SECRET', 'JWT Secret', 'secure authentication');
  warnIfMissing('OPENAI_API_KEY', 'OpenAI', 'AI provider');
  warnIfMissing('ANTHROPIC_API_KEY', 'Anthropic', 'AI provider');
}

export const config = {
  app: {
    name: 'Moataz AI',
    url: optionalEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000'),
    version: '1.0.0-rc',
    locale: optionalEnv('DEFAULT_LOCALE', 'en'),
    isProduction: process.env.NODE_ENV === 'production',
  },
  auth: {
    jwtSecret: optionalEnv('JWT_SECRET', 'build_time_default_secret_not_for_production'),
    sessionTimeout: optionalInt('SESSION_TIMEOUT_HOURS', 24),
    bcryptRounds: optionalInt('BCRYPT_ROUNDS', 12),
  },
  database: {
    url: requiredEnv('DATABASE_URL', 'file:./db/custom.db'),
  },
  storage: {
    endpoint: optionalEnv('S3_ENDPOINT'),
    bucket: optionalEnv('S3_BUCKET', 'moataz-ai'),
    accessKey: optionalEnv('S3_ACCESS_KEY'),
    secretKey: optionalEnv('S3_SECRET_KEY'),
    region: optionalEnv('S3_REGION', 'us-east-1'),
    isConfigured: !!process.env.S3_ENDPOINT && !!process.env.S3_ACCESS_KEY,
  },
  redis: {
    url: optionalEnv('REDIS_URL', 'redis://localhost:6379'),
    isConfigured: !!process.env.REDIS_URL,
  },
  qdrant: {
    url: optionalEnv('QDRANT_URL', 'http://localhost:6333'),
    apiKey: optionalEnv('QDRANT_API_KEY'),
    isConfigured: !!process.env.QDRANT_URL,
  },
  oauth: {
    google: {
      clientId: optionalEnv('GOOGLE_CLIENT_ID'),
      clientSecret: optionalEnv('GOOGLE_CLIENT_SECRET'),
      isConfigured: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
    },
    github: {
      clientId: optionalEnv('GITHUB_CLIENT_ID'),
      clientSecret: optionalEnv('GITHUB_CLIENT_SECRET'),
      isConfigured: !!process.env.GITHUB_CLIENT_ID && !!process.env.GITHUB_CLIENT_SECRET,
    },
  },
  encryption: {
    masterKey: optionalEnv('ENCRYPTION_MASTER_KEY', 'build_time_default_master_key_32_chars_long'),
  },
} as const;

// AI Provider keys — all optional, auto-detected at runtime
export const aiProviderKeys = {
  openai: optionalEnv('OPENAI_API_KEY'),
  anthropic: optionalEnv('ANTHROPIC_API_KEY'),
  gemini: optionalEnv('GEMINI_API_KEY'),
  deepseek: optionalEnv('DEEPSEEK_API_KEY'),
  groq: optionalEnv('GROQ_API_KEY'),
  mistral: optionalEnv('MISTRAL_API_KEY'),
  openrouter: optionalEnv('OPENROUTER_API_KEY'),
  nvidia: optionalEnv('NVIDIA_NIM_API_KEY'),
  huggingface: optionalEnv('HUGGINGFACE_API_KEY'),
  cohere: optionalEnv('COHERE_API_KEY'),
  azure: {
    key: optionalEnv('AZURE_OPENAI_API_KEY'),
    endpoint: optionalEnv('AZURE_OPENAI_ENDPOINT'),
  },
  together: optionalEnv('TOGETHER_API_KEY'),
  ollama: {
    url: optionalEnv('OLLAMA_BASE_URL', 'http://localhost:11434'),
  },
} as const;
