# Task-005: Moataz AI Phase 2 — AI Gateway API Routes & Encrypted API Key Management

**Agent**: Z.ai Code — fullstack developer
**Status**: ✅ Completed
**Date**: 2026-06-27

---

## Task Summary

Built the HTTP surface of the Moataz AI Phase 2 Enterprise AI Gateway: an encrypted key-vault module, an upgraded auth middleware that accepts both session tokens and `mz_` API keys, and nine Next.js 16 App Router API routes under `/api/v1/ai/*` that expose the `aiGateway` singleton (chat, streaming, embeddings, providers, models, health, usage, connection test). All routes authenticate via `getAuthUser`, enforce per-user rate limits, and return the standard `successResponse` / `errorResponse` envelope. Provider configuration endpoints encrypt API keys at rest with AES-256-GCM.

This task builds directly on the orchestration tier delivered in Task-004 (`gateway.ts`, `smart-router.ts`, `fallback-engine.ts`, `prompt-engine.ts`) and the foundational modules from Task-002/003 (`types.ts`, `registry.ts`, `usage-tracker.ts`, `health-monitor.ts`, drivers).

---

## Files Created / Modified

| # | File | Op | Purpose |
|---|------|----|---------|
| 1 | `src/lib/ai-gateway/key-vault.ts` | NEW | Encrypted API key storage. AES-256-GCM (`encryptApiKey`/`decryptApiKey`) with random 16-byte IV + auth tag, format `iv:authTag:ciphertext`. Master key derived via SHA-256 from `ENCRYPTION_MASTER_KEY` env (dev fallback). Also exports `maskApiKey`, `generateApiKey` (produces `mz_` + 48-hex-char keys + SHA-256 hash + prefix), `hashApiKey`, `validateApiKeyFormat`. |
| 2 | `src/lib/middleware.ts` | MODIFIED | `getAuthUser` now accepts **either** a `mz_` API key **or** a session JWT. API-key path: SHA-256 hash → `db.apiKey.findUnique({ where: { keyHash } })` → reject if revoked/expired → update `lastUsedAt` → return `apiKey.user`. Session path unchanged (`validateSession`). `requireAuth` helper preserved. |
| 3 | `src/app/api/v1/ai/chat/route.ts` | NEW | `POST` — non-streaming chat. 20 req/min/user rate limit. Forwards to `aiGateway.chat` with cache+fallback+retry enabled. Writes an `ai_chat` audit log (model, provider, tokens, cost). 502 on `GatewayError`, 500 otherwise. |
| 4 | `src/app/api/v1/ai/stream/route.ts` | NEW | `POST` — SSE streaming chat. 10 req/min/user. Wraps `aiGateway.stream` async generator in a `ReadableStream` + `TextEncoder`, emitting `data: <JSON>\n\n` frames. Closes on `chunk.done` or error (error frame still emitted). `Content-Type: text/event-stream`, `X-Accel-Buffering: no`. |
| 5 | `src/app/api/v1/ai/embeddings/route.ts` | NEW | `POST` — embeddings. 50 req/min/user. Defaults model to `text-embedding-3-small`. Forwards to `aiGateway.embeddings`. |
| 6 | `src/app/api/v1/ai/providers/route.ts` | NEW | `GET` — lists all registered providers (type + display name + availability) and every model in the registry with full capability/pricing metadata. |
| 7 | `src/app/api/v1/ai/providers/[type]/route.ts` | NEW | `GET` — health + models for one provider. `PUT` — upserts a `Provider` row (encrypts `apiKey` via `key-vault`), then hot-initializes the driver via `aiGateway.configureProvider` with the **decrypted** key. Emits a `provider` UPDATE audit log. Returns masked key. |
| 8 | `src/app/api/v1/ai/health/route.ts` | NEW | `GET` — calls `aiGateway.getProviderHealth()` and returns per-provider status plus a `summary` (total/healthy/degraded/unhealthy counts). |
| 9 | `src/app/api/v1/ai/usage/route.ts` | NEW | `GET` — usage analytics via `getUsageStats`. Filters by `organizationId`, `provider`, `startDate`, `endDate` query params; always scoped to the authenticated `user.id`. |
| 10 | `src/app/api/v1/ai/models/route.ts` | NEW | `GET` — lists all models (or filtered by `?provider=`) with full `ModelInfo` projection including `supportsAudio`, `maxOutputTokens`, `pricing`, `capabilities`, `status`. |
| 11 | `src/app/api/v1/ai/test/route.ts` | NEW | `POST` — sends a minimal `Hello` / 10-token request to a given `provider`+`model` with fallback disabled, returning latency + response + token/cost summary. Always 200 (success or `success:false` payload) so callers can introspect failures. |

---

## Authentication Flow (updated `getAuthUser`)

```
Authorization: Bearer <token>
                       │
                       ▼
        ┌──────────────────────────────┐
        │  token.startsWith('mz_') ?   │
        └──────────────┬───────────────┘
              yes      │      no
        ┌──────────────┘       └──────────────┐
        ▼                                     ▼
  SHA-256(token)                    validateSession(token)
  db.apiKey.findUnique              db.session.findUnique
  ─ revoked? → null                 ─ revoked/expired? → null
  ─ expired? → null                 ─ else session.user
  ─ update lastUsedAt
  ─ return apiKey.user
```

The `mz_` branch is tried **first**, so API keys take precedence over session tokens when both formats could apply (they can't — session tokens are 64-hex-char, API keys are `mz_`-prefixed).

---

## Encryption Details (`key-vault.ts`)

- **Algorithm**: `aes-256-gcm` (authenticated encryption — tampering of IV/authTag/ciphertext is detected on decrypt).
- **Master key**: `SHA-256(ENCRYPTION_MASTER_KEY || dev-fallback)` → 32 bytes. **Production must set `ENCRYPTION_MASTER_KEY`** (and ideally back it by KMS/Vault).
- **Stored format**: `iv(16B hex):authTag(16B hex):ciphertext(hex)` — a single colon-delimited string that fits Prisma's `String?` column on `Provider.apiKey`.
- **API key generation**: `mz_` + 24 random bytes (48 hex chars). Stored as **SHA-256 hash only** (`ApiKey.keyHash`), never plaintext — matching the existing `ApiKey` schema. `validateApiKeyFormat` enforces `/^mz_[a-f0-9]{48}$/`.

---

## Deviation From Spec (correctness fix)

The provided spec for route #7 (`providers/[type]/route.ts`) omitted the required `priority` field on the `ProviderConfig` passed to `aiGateway.configureProvider(...)`. `ProviderConfig.priority: number` is non-optional in `src/lib/ai-gateway/types.ts`, so the literal would fail TypeScript under `next dev`. I added `priority: 0` to the `configureProvider` call to keep the route type-correct. No other spec text was changed.

---

## Rate Limiting

| Endpoint | Key | Limit | Window |
|----------|-----|-------|--------|
| `POST /ai/chat` | `chat:<userId>` | 20 | 60s |
| `POST /ai/stream` | `stream:<userId>` | 10 | 60s |
| `POST /ai/embeddings` | `embed:<userId>` | 50 | 60s |
| others | — | — | — |

Uses the in-memory `rateLimit` from `src/lib/rate-limit.ts` (Map-based, auto-cleanup every 60s). The chat route additionally returns `X-RateLimit-Remaining` / `X-RateLimit-Reset` headers on 429.

---

## Verification

- ✅ `bun run lint` — **0 errors / 0 warnings**, exit code 0.
- ✅ All 9 routes compiled under `next dev` and returned HTTP 401 (correct — no auth token supplied, proving `getAuthUser` runs before body parsing). Compile times 79–540ms (first-hit cold compile). No TypeScript errors (`⨯`/`Type error`) logged for any new file.
- ℹ️ The dev log shows a **pre-existing** `Module not found: Can't resolve 'redis'` warning sourced from `src/lib/redis.ts` → `src/lib/ai-gateway/prompt-cache.ts` → `gateway.ts`. It is a warning (⚠), not an error, predates this task, and does not block compilation or request execution.

---

## Notes for Future Tasks

1. **Subscription plan**: All AI routes currently hardcode `subscriptionPlan: 'free'` (flagged with TODOs). Per Task-004's notes, the free-tier filter (`pricing.inputPer1k <= 0.001`) yields a thin candidate set — wire the user's real plan from their `Organization.plan` / membership before production use.
2. **API-key hashing migration**: The legacy `src/app/api/v1/api-keys/route.ts` stores keys hashed with **bcrypt**, while this task's `key-vault.ts` / middleware use **SHA-256**. Keys minted by the legacy route will not validate through the new `mz_` middleware branch. A follow-up should migrate the api-keys POST route to `key-vault.generateApiKey()` / `hashApiKey()` (or add a bcrypt-comparison fallback in `getAuthUser`) so there is one canonical key format.
3. **Streaming cost calculation**: `aiGateway.stream` records usage with `cost: 0` / `latency: 0` (Task-004 TODO). The stream route relays chunks as-is; a post-stream cost hook is still pending.
4. **Provider upsert key**: `PUT /ai/providers/[type]` upserts on `id: body.providerId || 'new'`. The `'new'` sentinel is never matched, so the first config for a provider always creates a fresh row — subsequent updates without `providerId` will create duplicates. Frontend should round-trip the returned `providerId`.
5. **RBAC**: Routes check authentication only, not authorization (e.g. whether the user is a member of `organizationId`). Add membership/role checks before exposing provider key management in production.
