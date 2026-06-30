FROM oven/bun:1.1-slim AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Build the application
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
# Generate Prisma client and build Next.js
RUN bun run build

# Production runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Copy necessary files for standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

# Add a startup script
RUN echo '#!/bin/sh\nbun prisma migrate deploy\nbun prisma db seed\nNODE_ENV=production bun server.js' > /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 3000
CMD ["./start.sh"]
