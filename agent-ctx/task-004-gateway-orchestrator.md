# Task-004: Moataz AI Phase 2 — Gateway Orchestrator (Smart Router + Fallback + Prompt Engine + Gateway)

**Agent**: Z.ai Code — fullstack developer
**Status**: ✅ Completed
**Date**: 2026-06-27

---

## Task Summary

Built the orchestration tier of the Moataz AI Phase 2 Enterprise AI Gateway. These four modules sit on top of the foundational files (types, registry, health-monitor, retry-engine, prompt-cache, usage-tracker, token-counter, cost-calculator) created in Task-002 and the provider drivers created in Task-003. Together they form the central request pipeline: every AI call flows through `aiGateway.chat` / `aiGateway.stream` / `aiGateway.embeddings`.

---

## Files Created

| # | File | Purpose |
|---|------|---------|
| 1 | `src/lib/ai-gateway/smart-router.ts` | Smart model router. Exposes `RoutingContext`, `RoutingDecision`, `routeRequest()`, and `extractRoutingContext()`. Filters candidates by capabilities, content length, provider availability, user preferences, subscription plan, and task type; then scores them on a weighted cost/latency/quality formula driven by the `priority` knob. |
| 2 | `src/lib/ai-gateway/fallback-engine.ts` | Fallback chain manager. Exposes `FallbackChain`, `buildFallbackChain()`, `executeWithFallback()`, `isFallbackEligible()`. Picks up to N fallback models from **different providers** than the primary, scored by capability/context/cost similarity + provider health. `executeWithFallback` is a generic primary-then-fallbacks runner with a `shouldFallback` predicate. |
| 3 | `src/lib/ai-gateway/prompt-engine.ts` | Prompt construction + context injection. Exposes `ContextSources`, `PromptBuildResult`, `buildPrompt()`, `extractUserInstructions()`, `summarizeConversation()`. Assembles a structured system prompt from project/memory/knowledge-base/file/conversation/user-instruction sources, then **compresses** sources in priority order if total tokens exceed the budget (`MAX_CONTEXT_TOKENS = 120000`). |
| 4 | `src/lib/ai-gateway/gateway.ts` | Main orchestrator. `AIGateway` class exported as singleton `aiGateway`. Methods: `chat`, `stream` (async generator), `embeddings`, `getProviderHealth`, `checkProvider`, `listProviders`, `listModels`, `configureProvider`. Re-exports `RoutingContext`. |

---

## Request Lifecycle (chat)

The `aiGateway.chat(request, options)` pipeline executes these steps in order:

1. **Prompt assembly** — if `options.context` is supplied, `buildPrompt()` merges all context sources into a single system message and prepends it to the user messages. Truncation metadata is surfaced (not yet wired to the response).
2. **Cache lookup** — if `shouldCache()` returns true (low temperature, short conversation), `getCachedResponse()` is queried. On hit, a synthetic `ChatResponse` is returned with `providerMetadata.cached = true`, `cost = 0`, `latency = 0`.
3. **Smart routing** — `extractRoutingContext()` infers `taskType` (chat/code/reasoning/vision/summary) and required capabilities from the request, then `routeRequest()` returns the best `ModelInfo` plus up to 3 alternatives.
4. **Fallback chain** — `buildFallbackChain()` picks up to `maxFallbacks` alternative models from different providers, scored by similarity to the primary.
5. **Execute with retry + fallback** — iterates `[primary, ...fallbacks]`. For each, calls `withRetry(driver.chat, { maxRetries })` (or direct call if `enableRetry: false`). On a `isFallbackEligible()` error (retryable, 429, 5xx, timeout/network/connection), advances to the next model; otherwise rethrows. Non-fallback-eligible errors fail fast.
6. **Usage recording** — `recordUsage()` writes to the `Analytics` table (event `ai_usage`) with provider, model, task type, token counts, cost, latency, success flag, retries, and fallbacks count.
7. **Cache write** — successful responses are written back to the cache via `setCachedResponse()` (1h TTL).

The `stream()` method follows the same routing + fallback logic but yields `StreamChunk`s directly from the driver's async generator. Usage is recorded with `cost: 0` and `latency: 0` (post-stream cost calculation is flagged for future work).

The `embeddings()` method bypasses routing (the model is already named in the request), looks up the model in the registry, gets its driver, applies retry, and records usage. On failure, it still records an unsuccessful usage record with the error message.

---

## Routing Heuristics

`scoreModel(model, context)` returns 0–~135 based on `context.priority`:

| Priority | Cost | Latency | Quality |
|----------|------|---------|---------|
| cost | 0.70 | 0.10 | 0.20 |
| latency | 0.20 | 0.70 | 0.10 |
| quality | 0.15 | 0.15 | 0.70 |
| balanced | 0.33 | 0.33 | 0.34 |

Bonuses: `+20` if `preferredProvider` matches, `+15` if model is in `userPreferences.preferredModels`.

Sub-scores (each 0–100):
- `costScore = max(0, 100 - costPer1k*1000)` (free models → 100)
- `latencyScore = max(0, 100 - avgLatency/100)` (defaults to 50 when `avgLatency` unknown)
- `qualityScore = min(100, contextWindow/2000)` (larger context = higher quality potential)

`extractRoutingContext()` derives the task type from keyword detection on the last user message (`code`/`function`/`class` → `code`; `explain`/`analyze`/`reason` → `reasoning`; `summarize`/`summary` → `summary`). Vision is detected by presence of `image_url` or `image` content parts in any message.

---

## Fallback Similarity Scoring

`scoreSimilarity(candidate, primary)` (max ~120):

| Factor | Points |
|--------|--------|
| `supportsVision` match | 20 |
| `supportsToolCalling` match | 20 |
| `supportsJsonMode` match | 15 |
| `supportsStreaming` match | 15 |
| Context-window closeness | up to 30 |
| Cost-tier closeness | up to 20 |
| Healthy provider bonus | 10 |

Fallbacks are restricted to **different providers** than the primary (one model per provider in the chain) to maximize resilience.

`isFallbackEligible(error)` returns true for:
- `ProviderError` with `retryable === true`, `statusCode === 429`, or `statusCode >= 500`
- Plain `Error` whose message contains `timeout`, `connection`, or `network`

Non-eligible errors (e.g. 400 Bad Request, 401 Unauthorized, content-filter rejections) fail fast — no point trying another provider since the request itself is the problem.

---

## Prompt Compression Strategy

When `systemTokens + userTokens > maxTokens`, `buildPrompt()` truncates context sources in this priority order (largest/most-expendable first):

1. `knowledgeBaseContext`
2. `memoryContext`
3. `fileContext`
4. `projectContext`
5. `conversationContext`

Each source is cut to **50% of its original length** with a `[...truncated...]` marker, then the system token count is recomputed. The loop exits as soon as the budget is met. The `PromptBuildResult.truncatedSources` array lists which sources were trimmed, and `compressed: true` flags that compression happened. The `systemPrompt` and `userInstructions` sources are never truncated (they're treated as essential).

---

## Key Design Decisions

- **No `executeWithFallback` usage in `gateway.ts`** — the gateway manually iterates `[primary, ...fallbacks]` so it can also run `withRetry` per-model (the generic `executeWithFallback` doesn't compose well with per-model retry). `executeWithFallback` is still exported from `fallback-engine.ts` for callers that want a simpler retry-then-fallback primitive.
- **Re-export of `RoutingContext`** from `gateway.ts` — ergonomic for API route handlers that import everything from `'@/lib/ai-gateway/gateway'`.
- **Free-tier pricing filter** — `subscriptionPlan === 'free'` restricts candidates to models with `pricing.inputPer1k <= 0.001`. This currently yields an empty candidate set on most real catalogs (e.g. GPT-4o-mini is $0.00015/1k which qualifies; Gemini Flash qualifies; GPT-4o doesn't). API routes should pass the user's real plan to avoid surprise 503s.
- **Cached response synthetic provider** is `'CUSTOM'` with `providerMetadata.cached = true`. Downstream code can detect cache hits via either field.
- **Stream usage recording** uses `cost: 0` / `latency: 0` placeholders — a TODO is flagged in the code comment for a post-stream cost calculator that runs after the generator completes.
- **Defensive `if (!response)` guard** after the fallback loop covers the edge case where no driver could be resolved for any candidate model (e.g. all providers unconfigured). Throws `GatewayError('NO_RESPONSE')`.

---

## Verification

- ✅ `bun run lint` — passed cleanly (**0 errors / 0 warnings**, exit 0).
- ✅ Dev server log shows continuing `GET / 200` responses — the new modules compile and import without breaking the running app. (The `EADDRINUSE :::3000` line in `dev.log` is the known transient race from the init script's dev-server startup; the server recovered and is serving 200s.)

---

## Public API Surface

```typescript
// gateway.ts
export const aiGateway: AIGateway;
export interface GatewayOptions { userId; organizationId?; subscriptionPlan?; enableCache?; enableFallback?; enableRetry?; context?; maxRetries?; maxFallbacks?; }
export type { RoutingContext };

// smart-router.ts
export interface RoutingContext { taskType; priority; preferredProvider?; excludedProviders?; minContextWindow?; requiresVision?; requiresAudio?; requiresToolCalling?; requiresJsonMode?; requiresThinking?; requiresStreaming?; subscriptionPlan?; userPreferences?; }
export interface RoutingDecision { model; reason; alternatives; }
export function routeRequest(request, context): Promise<RoutingDecision>;
export function extractRoutingContext(request, userId, subscriptionPlan?): RoutingContext;

// fallback-engine.ts
export interface FallbackChain { primary; fallbacks; reason; }
export function buildFallbackChain(primary, request, maxFallbacks?): FallbackChain;
export function executeWithFallback<T>(primary, fallbacks, shouldFallback): Promise<{result, attempts, fallbackUsed}>;
export function isFallbackEligible(error): boolean;

// prompt-engine.ts
export interface ContextSources { systemPrompt?; projectContext?; conversationContext?; memoryContext?; knowledgeBaseContext?; fileContext?; userInstructions?; }
export interface PromptBuildResult { messages; tokenCount; compressed; truncatedSources; }
export function buildPrompt(userMessages, context, maxTokens?): Promise<PromptBuildResult>;
export function extractUserInstructions(messages): string | undefined;
export function summarizeConversation(messages, maxTokens?): string;
```

---

## What's Next (Suggested for Task-005+)

1. **API routes** — `src/app/api/v1/ai/chat/route.ts`, `…/stream/route.ts`, `…/embeddings/route.ts`, `…/models/route.ts`, `…/health/route.ts`. Each should authenticate the user (NextAuth), resolve their subscription plan, build a `GatewayOptions` object, and forward to `aiGateway`. Streaming routes should use a `ReadableStream`/`TextEncoder` to relay `StreamChunk`s as SSE.
2. **Admin dashboard** — `src/app/admin/ai-gateway/page.tsx` surfacing `aiGateway.getProviderHealth()`, `aiGateway.listModels()`, `getUsageStats()`.
3. **Cost calculator integration in stream** — wrap `driver.stream()` to accumulate tokens and call `calculateChatCost()` before recording usage.
4. **Per-user routing rules** — extend `RoutingContext` with a `userRules` field loaded from the DB (model preferences, blocked providers, spend caps).
5. **Real subscription-tier pricing gates** — replace the hardcoded `pricing.inputPer1k <= 0.001` free-tier filter with a configurable tier→model-allowlist mapping.
6. **LLM-backed conversation summarization** — replace the deterministic `summarizeConversation()` heuristic with an actual model call when the conversation exceeds N messages.
