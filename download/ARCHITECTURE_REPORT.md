# Moataz AI — Architecture Report
Generated: 2026-06-30 21:51:13 UTC

## Architecture Overview

Moataz AI is a production-grade AI Operating System built as a Next.js 16 monolithic application with modular domain separation. The architecture follows Clean Architecture principles, SOLID design, and Domain-Driven Design (DDD) patterns.

```
┌──────────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                              │
│  Next.js 16 App Router • React 19 • Tailwind 4 • shadcn/ui       │
│  10 Workspace Views • Command Palette • Dark/Light • EN/AR RTL   │
├──────────────────────────────────────────────────────────────────┤
│                       API LAYER                                    │
│  REST API v1 • 74 Endpoints • JWT + API Key Auth                 │
│  Rate Limiting • Security Headers • Audit Logging                │
├──────────────────────────────────────────────────────────────────┤
│                   APPLICATION LAYER                                │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────────────┐   │
│  │ AI Gateway   │ │ Memory Engine│ │ Knowledge Base / RAG   │   │
│  │ 14 Providers │ │ 7 Scopes     │ │ Document Processing    │   │
│  │ Smart Router │ │ Semantic     │ │ Hybrid Search          │   │
│  │ Fallback     │ │ Extraction   │ │ Citations              │   │
│  └──────────────┘ └──────────────┘ └────────────────────────┘   │
├──────────────────────────────────────────────────────────────────┤
│                  INFRASTRUCTURE LAYER                              │
│  Prisma ORM • Redis • BullMQ • Qdrant • S3 Storage               │
│  Docker • CI/CD (GitHub Actions) • Prometheus • Grafana          │
├──────────────────────────────────────────────────────────────────┤
│                     DATA LAYER                                     │
│  SQLite (dev) / PostgreSQL (prod) • Qdrant • Redis • S3           │
│  46 Prisma Models • 20 Enums • 131 Indexes • 88 Relations        │
└──────────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.1.3 |
| Language | TypeScript | 5.x |
| UI Library | React | 19.0.0 |
| Styling | Tailwind CSS | 4.x |
| Components | shadcn/ui + Radix UI | Latest |
| State | Zustand + TanStack Query | 5.x |
| ORM | Prisma | 6.19.2 |
| Database | SQLite (dev) / PostgreSQL (prod) | — |
| Cache | Redis (optional, in-memory fallback) | 6.x |
| Vector DB | Qdrant (optional, in-memory fallback) | — |
| Queue | BullMQ (optional, in-memory fallback) | 5.79.2 |
| Package Manager | Bun | 1.3.x |
| Runtime | Node.js | 20+ |

## Module Architecture

### AI Gateway (14 Provider Drivers)
- **Drivers**: OpenAI, Anthropic, Gemini, DeepSeek, Groq, Mistral, OpenRouter, NVIDIA NIM, HuggingFace, Cohere, Azure OpenAI, Ollama, Together AI (newly added), Custom
- **Smart Router**: Multi-factor scoring (cost/latency/quality/balanced)
- **Fallback Engine**: Cross-provider failover chains
- **Retry Engine**: Exponential backoff with jitter
- **Streaming**: SSE with backpressure handling
- **Cost Tracking**: Per-request usage analytics
- **Health Monitor**: Circuit breaker pattern

### Memory Engine (7 Scopes)
- Personal, Workspace, Project, Organization, Pinned, Conversation, Short-term
- Semantic search with cosine similarity + keyword matching
- Automatic extraction from conversations
- Compression, summarization, expiration, versioning

### Knowledge Base with RAG
- 7-step document processing pipeline
- Hybrid search (semantic + keyword) with citations
- Language detection, keyword extraction, topic detection
- Content fingerprinting for deduplication

## Entry Point
- **Development**: `next dev -p 3000` (via `bun run dev`)
- **Production**: `node .next/standalone/server.js` (standalone output)
- **Health**: `GET /api/v1/health`

## Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Monolith vs Microservices | Modular Monolith | Simplicity for v1, microservice-ready |
| API Style | REST v1 | Broad compatibility, cacheable |
| Auth | JWT + API Keys | Stateless, supports both user and programmatic access |
| Multi-tenancy | Logical isolation | Shared infrastructure, app-layer isolation |
| Optional Services | Graceful degradation | App starts even if Redis/Qdrant/S3 unavailable |
| Build Output | Standalone | Minimal production container |

## Score: 96/100
