#!/bin/sh
# ============================================================
# Moataz AI — Production startup script
# Diagnostics -> wait for DB -> migrate -> conditional seed -> start
# Forwards SIGTERM/SIGINT to the Node process for graceful shutdown.
# ============================================================
set -eu

log() {
  printf '{"level":"info","ts":"%s","msg":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1"
}
err() {
  printf '{"level":"error","ts":"%s","msg":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >&2
}

# ---------- 1. Startup diagnostics ----------
log "Starting Moataz AI"
log "node: $(node --version 2>/dev/null || echo unknown), bun: $(bun --version 2>/dev/null || echo unknown)"
log "NODE_ENV=${NODE_ENV:-unset} PORT=${PORT:-3000}"

if [ -z "${DATABASE_URL:-}" ]; then
  err "DATABASE_URL is not set — cannot continue"
  exit 1
fi

# Mask credentials when logging the DB target
# Extract host safely even with special chars in password
DB_HOST=$(printf '%s' "$DATABASE_URL" | awk -F'@' '{print $NF}' | cut -d'/' -f1)
log "Database target: ${DB_HOST}"

# ---------- 2. Retry DB connection ----------
MAX_RETRIES=20
RETRY_DELAY=5
attempt=1

# Extract host and port for a simple TCP check
DB_HOST_ONLY=$(printf '%s' "$DB_HOST" | cut -d':' -f1)
DB_PORT=$(printf '%s' "$DB_HOST" | cut -d':' -f2)
DB_PORT=${DB_PORT:-5432}

log "Waiting for database at ${DB_HOST_ONLY}:${DB_PORT}..."

# Simple TCP check using /dev/tcp if available, or just proceed to migrate
until timeout 2 sh -c "cat < /dev/null > /dev/tcp/${DB_HOST_ONLY}/${DB_PORT}" 2>/dev/null; do
  if [ "$attempt" -ge "$MAX_RETRIES" ]; then
    log "TCP check failed, but will attempt Prisma migration anyway..."
    break
  fi
  log "Database port not reachable (attempt ${attempt}/${MAX_RETRIES}), retrying in ${RETRY_DELAY}s..."
  attempt=$((attempt + 1))
  sleep "$RETRY_DELAY"
done
log "Database port check finished"

# ---------- 3. Automatic Prisma migration ----------
log "Applying Prisma migrations..."
if bunx prisma migrate deploy; then
  log "Migrations applied"
else
  err "prisma migrate deploy failed"
  exit 1
fi

# ---------- 4. Seed database ----------
# We will always run seed with --skip-generate to be safe, 
# the seed script itself should handle "if exists" logic.
log "Running database seed..."
if bunx prisma db seed; then
  log "Seed completed"
else
  err "Seed failed or already initialized (continuing startup)"
fi

# ---------- 5. Start server with graceful shutdown ----------
log "Starting Next.js standalone server on port ${PORT:-3000}"

term_handler() {
  log "Received shutdown signal, forwarding to server (pid $child)"
  kill -TERM "$child" 2>/dev/null
  wait "$child"
  log "Server stopped cleanly"
  exit 0
}
trap term_handler TERM INT

NODE_ENV=production bun server.js &
child=$!
wait "$child"
