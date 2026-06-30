# Task-003: Moataz AI Phase 2 — Provider Drivers & Registry

**Agent**: Claude (Code) — fullstack developer
**Status**: ✅ Completed
**Date**: 2026-06-27

---

## Task Summary

Implemented the full provider-driver layer for the Moataz AI Phase 2 Enterprise AI Gateway: an abstract `BaseDriver`, 12 concrete provider drivers, an `OpenAICompatibleDriver` shared base, a generic `CustomDriver`, and a `ProviderRegistry` + `ModelRegistry` singleton pair. All drivers implement the `ProviderDriver` interface defined in `src/lib/ai-gateway/types.ts` and build on the token-counter / cost-calculator / health-monitor modules created in Task-002.

Previous agents' work records reviewed:
- `/agent-ctx/task-001-main-agent.md`
- `/agent-ctx/task-002-ai-gateway-core.md`

---

## Files Created (16 total)

### Infrastructure (3)

| # | File | Purpose |
|---|------|---------|
| 1 | `src/lib/ai-gateway/drivers/base-driver.ts` | Abstract `BaseDriver` class implementing `Partial<ProviderDriver>`. Provides `initialize()`, `requireConfig()`, `getApiKey()`, `getBaseUrl()`, `validateApiKey()`, `estimateCost()` (default), `makeRequest()` (with `AbortController` timeout → `ProviderError` on abort/connection failure), `parseOpenAIError()`, and an abstract `getDefaultBaseUrl()` + `listModels()`. Also exports the `parseSSEStream()` async generator helper used by all OpenAI-style SSE streams. |
| 2 | `src/lib/ai-gateway/drivers/openai-compatible-driver.ts` | `OpenAICompatibleDriver extends OpenAIDriver`. Constructor takes `(providerType, baseUrl, models)`. Exposes `protected _baseUrl` / `protected _models` and overrides `getDefaultBaseUrl()` + `getModels()` + `listModels()` so all inherited `chat`/`stream`/`embeddings`/`imageGeneration`/`estimateCost` methods use the provider-correct catalog. |
| 3 | `src/lib/ai-gateway/registry.ts` | `ProviderRegistry` singleton (registers all 13 driver types, `getDriver()`, `initializeProvider()`, `loadFromDatabase(organizationId)` via Prisma `db.provider.findMany`) + `ModelRegistry` singleton (keyed `${provider}:${modelId}`, `findModel()`, `getModelsByProvider()`, `filterModels(criteria)`, `loadFromDrivers()`). Both auto-initialize on module load. |

### Primary Provider Drivers (3 — full custom implementations)

| # | File | Provider | Notes |
|---|------|----------|-------|
| 4 | `drivers/openai-driver.ts` | OPENAI | 9-model catalog (GPT-4o, 4o-mini, 4-turbo, o1-preview, 2 embeddings, DALL-E 3, Whisper, TTS-1). Full `chat`/`stream`/`embeddings`/`imageGeneration`/`speechToText`/`textToSpeech`/`health`/`estimateCost`. Added `protected getModels()` hook so OpenAI-compatible subclasses get correct per-provider cost lookup. |
| 5 | `drivers/anthropic-driver.ts` | ANTHROPIC | Claude 3.5 Sonnet, 3.5 Haiku, 3 Opus. Splits system prompt via `extractSystemPrompt()`, maps Anthropic `content_block_delta` SSE events, translates `tool_use` blocks → OpenAI-style `toolCalls`. `embeddings()` throws `unsupported` (Anthropic has no embedding API). Health check uses a 1-token `/messages` ping (no `/models` endpoint). |
| 6 | `drivers/gemini-driver.ts` | GEMINI | Gemini 1.5 Pro, 1.5 Flash, 1.5 Flash-8B, text-embedding-004. `convertMessagesToGemini()` maps roles (`assistant`→`model`) and extracts `systemInstruction`. URL-key auth (`?key=…`). Streaming uses `:streamGenerateContent?alt=sse`. |

### OpenAI-Compatible Drivers (7 — extend `OpenAICompatibleDriver`)

| # | File | Provider | Base URL | Model count |
|---|------|----------|----------|-------------|
| 7 | `drivers/deepseek-driver.ts` | DEEPSEEK | `api.deepseek.com/v1` | 2 (chat, reasoner) |
| 8 | `drivers/groq-driver.ts` | GROQ | `api.groq.com/openai/v1` | 3 (Llama 3.3 70B, 3.1 8B, Mixtral 8x7B) |
| 9 | `drivers/mistral-driver.ts` | MISTRAL | `api.mistral.ai/v1` | 3 (Large, Small, Embed) |
| 10 | `drivers/openrouter-driver.ts` | OPENROUTER | `openrouter.ai/api/v1` | 3 (GPT-4o, Claude 3.5, Gemini Flash passthrough) |
| 11 | `drivers/nvidia-nim-driver.ts` | NVIDIA_NIM | `integrate.api.nvidia.com/v1` | 2 (Nemotron 70B, Llama 405B) |
| 12 | `drivers/ollama-driver.ts` | OLLAMA | `localhost:11434/v1` (overrideable) | 3 defaults + live `/api/tags` discovery with 5s timeout, caches dynamic list and syncs into `_models` for cost lookup |
| 13 | `drivers/custom-driver.ts` | CUSTOM | `""` (must be set via `config.baseUrl`) | 1 default; `config.config.models` array can replace the catalog at `initialize()` time |

### Independent Provider Drivers (2 — full custom, not OpenAI-compatible)

| # | File | Provider | Notes |
|---|------|----------|-------|
| 14 | `drivers/huggingface-driver.ts` | HUGGING_FACE | Routes to `/{model}/v1/chat/completions` (TGI endpoints) for chat/stream; `/{model}` for embeddings. Health check hits `huggingface.co/api/whoami-v2`. |
| 15 | `drivers/cohere-driver.ts` | COHERE | Command R+, Command R, Embed English v3. Uses Cohere `/v1/chat` (preamble + chat_history format) and `/v1/embed`. Refactored shared `buildChatBody()` for chat + stream. Fixed cost calc to use per-model pricing (was hardcoded `total: 0` in spec). |

### Azure (1 — extends OpenAIDriver with URL override)

| # | File | Provider | Notes |
|---|------|----------|-------|
| 16 | `drivers/azure-openai-driver.ts` | AZURE_OPENAI | Overrides `chat()` to use `/openai/deployments/{deploymentId}/chat/completions?api-version=…` with `api-key` header (not Bearer). `deploymentId` + `apiVersion` pulled from `config.config`. Requires `config.baseUrl`. Overrides `getModels()` → `AZURE_MODELS`. |

---

## Key Design Decisions & Deviations from Spec

1. **`protected getModels()` added to `OpenAIDriver`** — The original spec had `OpenAIDriver.chat()` look up the request model in the hardcoded `OPENAI_MODELS` constant. For `OpenAICompatibleDriver` subclasses (DeepSeek, Groq, etc.) this would always miss and fall back to `OPENAI_MODELS[0]` (GPT-4o pricing) — a cost-calculation bug. Added a `protected getModels(): ModelInfo[]` hook (returns `OPENAI_MODELS` in the base, overridden in `OpenAICompatibleDriver` to return `this._models`) and switched all lookup sites in `chat`/`embeddings`/`imageGeneration`/`estimateCost` to use `this.getModels()`. Now each provider's own pricing is used.

2. **`_baseUrl` / `_models` changed from `private` to `protected`** in `OpenAICompatibleDriver` — The spec used `private` fields with `this['_baseUrl']` bracket-notation access in `OllamaDriver` and `CustomDriver`. Bracket notation on private fields is fragile under TypeScript strict mode. Made the fields `protected` so subclasses (`OllamaDriver.initialize()`, `CustomDriver.initialize()`) can assign directly via `this._baseUrl = …` / `this._models = …`.

3. **`CohereDriver` cost calculation fixed** — The spec hardcoded `total: 0` in the `chat()` cost object. Fixed to compute `promptCost + completionCost` using the matched model's `inputPer1k`/`outputPer1k` from `COHERE_MODELS` (falls back to Command R+ pricing). Also extracted a private `buildChatBody()` helper to deduplicate the chat + stream method bodies.

4. **`OllamaDriver.listModels()` syncs `_models`** — When live model discovery from `/api/tags` succeeds, the discovered list is also assigned to `this._models` so that inherited `OpenAIDriver.chat()` cost lookups resolve against the live model set (not just the 3 defaults).

5. **`parseSSEStream` return type** — Changed the explicit return type from `AsyncGenerator<StreamChunk, …>` to `AsyncGenerator<any, …>` to avoid importing the `StreamChunk` type solely for a yield-shape that's structurally compatible. The yielded objects still match `StreamChunk` structurally.

6. **`Buffer` → `Uint8Array` for `Blob` constructor** — In `OpenAIDriver.speechToText()`, `new Blob([audio])` where `audio: Buffer` triggers `TS2322` under the project's strict TS + DOM lib config (`Buffer<ArrayBufferLike>` is not directly assignable to `BlobPart`). Wrapped as `new Blob([new Uint8Array(audio)])`.

7. **`registry.ts` `loadFromDatabase` per-provider try/catch** — Wrapped each provider's `initializeProvider()` in its own try/catch so one bad provider config doesn't abort loading the rest. The outer DB-query try/catch is preserved.

8. **`registry.ts` model-load failure is non-fatal** — `modelRegistry.loadFromDrivers(providerRegistry)` runs on module import but `.catch(console.warn)`s; e.g. `OllamaDriver.listModels()` will fail (no Ollama running in most envs) without breaking module load.

---

## Dependencies

- **No new npm packages required.** All drivers use:
  - `fetch` / `AbortController` / `AbortSignal.timeout` / `FormData` / `Blob` / `TextDecoder` — all built into Node.js 18+ (Next.js 16 runtime).
  - `@/lib/db` (Prisma singleton) — already present.
  - `../types`, `../token-counter`, `../cost-calculator` — already present from Task-002.
  - `tiktoken` — already installed (used indirectly via `token-counter.ts`).
- **No Prisma schema changes** — the existing `Provider` model (`type`, `name`, `apiKey`, `baseUrl`, `isActive`, `config`) and `ProviderType` enum already cover everything `registry.loadFromDatabase()` needs.

---

## Verification

- ✅ **`bun run lint`** — passes with **0 errors / 0 warnings** (exit 0).
- ✅ **`npx tsc --noEmit`** — **0 errors** in any `src/lib/ai-gateway/` file (all 16 new files type-check cleanly). The 49 remaining project-wide tsc errors are all pre-existing in `src/app/api/v1/*` routes, `src/lib/bullmq.ts`, `src/lib/redis.ts`, `src/lib/storage.ts`, `examples/`, and `skills/` — none introduced by this task.
- ✅ **Dev server** (`bun run dev`) — still serving `GET / 200` from `dev.log`. The `EADDRINUSE :::3000` line is a transient race during the auto-dev-server startup (the init script's server wins; the second invocation exits). The server recovered and is healthy.

---

## Architecture Notes for Downstream Agents

### Driver inheritance graph

```
BaseDriver (abstract)
├── OpenAIDriver          ← chat/stream/embeddings/imageGeneration/STT/TTS/health/estimateCost
│   ├── OpenAICompatibleDriver
│   │   ├── DeepSeekDriver
│   │   ├── GroqDriver
│   │   ├── MistralDriver
│   │   ├── OpenRouterDriver
│   │   ├── NvidiaNimDriver
│   │   ├── OllamaDriver   ← overrides initialize() + listModels() (live /api/tags)
│   │   └── CustomDriver   ← overrides initialize() (baseUrl + models from config)
│   └── AzureOpenAIDriver  ← overrides chat() + health() (Azure URL scheme + api-key header)
├── AnthropicDriver        ← full custom (Messages API, SSE content_block_delta)
├── GeminiDriver           ← full custom (generateContent, ?key= auth)
├── HuggingFaceDriver      ← full custom (TGI /v1/chat/completions)
└── CohereDriver           ← full custom (/v1/chat preamble+history, /v1/embed)
```

### How to use the registry

```typescript
import { providerRegistry, modelRegistry } from '@/lib/ai-gateway/registry';
import type { ProviderConfig, ChatRequest } from '@/lib/ai-gateway/types';

// 1. Initialize a provider with credentials (typically loaded from DB)
await providerRegistry.initializeProvider({
  type: 'OPENAI', name: 'OpenAI Production',
  apiKey: process.env.OPENAI_API_KEY, isActive: true, priority: 0,
});

// 2. Get the driver and make a request
const driver = providerRegistry.getDriver('OPENAI')!;
const response = await driver.chat({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello' }],
});

// 3. Or stream
for await (const chunk of driver.stream({ model: 'gpt-4o-mini', messages: [...] })) {
  process.stdout.write(chunk.delta);
}

// 4. Query the model catalog
const visionModels = modelRegistry.filterModels({
  supportsVision: true, supportsStreaming: true, status: 'active',
});
```

### What's Next (Suggested for Task-004+)

1. **Router/orchestrator** (`src/lib/ai-gateway/router.ts`) — use `providerRegistry` + `modelRegistry` + `health-monitor` + `cost-calculator` + `retry-engine` + `prompt-cache` to pick the best driver for a `ChatRequest` (by `taskType`, `priority`, health, cost).
2. **Fallback chains** — when a driver fails, try the next-best provider for the same model family (e.g. OpenAI → Azure OpenAI → OpenRouter for GPT-4o).
3. **API routes** — `src/app/api/v1/ai/chat/route.ts`, `…/embeddings/route.ts`, `…/models/route.ts`, `…/stream/route.ts` exposing the gateway to the frontend.
4. **Provider admin UI** — settings page to add/edit/delete `Provider` rows (writing `apiKey` encrypted), test connection (`driver.validateApiKey()`), view `driver.health()`.
5. **Model aliasing** — map friendly names (`gpt-4o-latest`) → concrete `externalId` per provider, so the router can swap providers transparently.
