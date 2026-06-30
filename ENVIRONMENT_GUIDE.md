# Environment Variables Guide

This document lists all environment variables used by Moataz AI.

## Required Variables
These must be set for the application to start in production.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (Supabase). |
| `JWT_SECRET` | Yes | Secret key for signing JSON Web Tokens. |
| `ENCRYPTION_MASTER_KEY` | Yes | 32-character key for encrypting AI provider API keys. |

## Optional Service Variables
Features associated with these variables will be disabled if not provided.

| Variable | Service | Feature |
|----------|---------|---------|
| `REDIS_URL` | Redis | Caching and background queues. |
| `QDRANT_URL` | Qdrant | Vector search for RAG. |
| `S3_ENDPOINT` | S3 Storage | Persistent file storage. |

## AI Provider Keys
All AI keys are optional. The system will auto-discover available providers at runtime.

| Variable | Provider |
|----------|----------|
| `OPENAI_API_KEY` | OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic |
| `GEMINI_API_KEY` | Google Gemini |
| `DEEPSEEK_API_KEY` | DeepSeek |
| `GROQ_API_KEY` | Groq |

## Security Note
**Never** commit a `.env` file to the repository. Use Railway's encrypted environment variable management for production secrets.
