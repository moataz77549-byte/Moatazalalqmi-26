# Moataz AI

**Enterprise AI Operating System**

Moataz AI is a production-grade AI Operating System that unifies multi-provider AI chat, persistent memory, knowledge base with RAG, and intelligent search into a single workspace. Built across 4 development phases, the platform provides a complete enterprise AI experience.

## Features

### AI Gateway (12 Providers, 40+ Models)
- **Providers**: OpenAI, Anthropic Claude, Google Gemini, DeepSeek, Groq, Mistral, OpenRouter, NVIDIA NIM, HuggingFace, Cohere, Azure OpenAI, Ollama, Custom
- **Smart Router**: Multi-factor model selection (cost, latency, quality, balanced)
- **Fallback Engine**: Cross-provider automatic failover
- **Streaming**: SSE streaming with backpressure handling
- **Cost Tracking**: Per-request usage analytics and billing

### AI Workspace
- **Chat Experience**: Streaming responses, markdown rendering, syntax highlighting, KaTeX math, message actions (copy, edit, retry, branch, react)
- **File Manager**: Drag & drop upload, folders, version history, preview
- **Notes**: Markdown editor with live preview, pinning, tags
- **Tasks**: Kanban board with drag-and-drop, priorities, due dates
- **Artifacts**: AI-generated content gallery (code, documents, charts)
- **Command Palette**: ⌘K with quick actions, navigation, and global search

### Memory Engine (7 Scopes)
- Personal, Workspace, Project, Organization, Pinned, Conversation, Short-term
- Semantic search with cosine similarity + keyword matching
- Automatic extraction from conversations
- Compression, summarization, expiration, versioning, permissions

### Knowledge Base with RAG
- Document processing pipeline (extraction, deduplication, chunking, embedding, indexing)
- Hybrid search (semantic + keyword) with citation support
- Collections with hierarchical folders
- Language detection, keyword extraction, topic detection

### Global Intelligent Search
- Federated search across 9 content types (chats, messages, files, documents, notes, artifacts, projects, memories, prompts)
- AI-powered summaries, keyword extraction, and classification

### Enterprise Features
- Multi-tenant architecture with organization/team isolation
- RBAC with 5 roles (Super Admin, Admin, Manager, Member, Guest)
- JWT + API key authentication
- AES-256-GCM API key encryption
- Comprehensive audit logging
- Rate limiting on all endpoints
- Dark/light themes with Arabic RTL support
- WCAG 2.2 AA accessibility compliance

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui |
| Backend | Next.js API Routes, Prisma ORM |
| Database | PostgreSQL (production) / SQLite (development) |
| Cache | Redis (with in-memory fallback) |
| Vector DB | Qdrant (with in-memory fallback) |
| Queue | BullMQ (with in-memory fallback) |
| Storage | S3-compatible (with local fallback) |
| Container | Docker, Docker Compose |
| CI/CD | GitHub Actions |
| Monitoring | OpenTelemetry, Prometheus, Grafana |

## Quick Start

```bash
# Install dependencies
bun install

# Set up environment
cp .env.example .env

# Initialize database
bun run db:push

# Start development server
bun run dev
```

Visit `http://localhost:3000` and register an account.

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development server |
| `bun run build` | Build for production |
| `bun run start` | Start production server |
| `bun run lint` | Run ESLint |
| `bun run typecheck` | Run TypeScript type checking |
| `bun run db:push` | Push schema to database |
| `bun run db:generate` | Generate Prisma client |
| `bun run db:migrate` | Create database migration |
| `bun run db:studio` | Open Prisma Studio |

## Project Structure

```
moataz-ai/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx           # Entry point
│   │   ├── layout.tsx         # Root layout
│   │   └── api/v1/            # REST API (100+ endpoints)
│   ├── components/
│   │   ├── ui/                # shadcn/ui components
│   │   └── workspace/         # Application components
│   └── lib/
│       ├── ai-gateway/        # AI Gateway (12 providers)
│       ├── memory/            # Memory Engine
│       ├── knowledge/         # Knowledge Base & RAG
│       └── ...                # Core utilities
├── prisma/
│   └── schema.prisma          # Database schema (40+ models)
├── docker-compose.yml          # Full stack deployment
├── Dockerfile                  # Production container
└── .github/workflows/         # CI/CD pipeline
```

## Documentation

Comprehensive documentation is available in the `/download` directory:
- Architecture Report
- API Documentation
- Security Audit
- Deployment Guide
- Developer Guide
- Administrator Guide
- User Guide

## License

Proprietary — All rights reserved.

---

**Moataz AI** — The AI Operating System for Enterprise
