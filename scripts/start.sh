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
MAX_RETRIES=10
RETRY_DELAY=3
attempt=1
# Use a simple connection check that is less sensitive to Prisma CLI startup overhead
until bunx prisma db execute --stdin --url "$DATABASE_URL" <<EOF
SELECT 1;
EOF
do
  if [ "$attempt" -ge "$MAX_RETRIES" ]; then
    err "Database unreachable after ${MAX_RETRIES} attempts — exiting"
    exit 1
  fi
  log "Database not ready (attempt ${attempt}/${MAX_RETRIES}), retrying in ${RETRY_DELAY}s..."
  attempt=$((attempt + 1))
  sleep "$RETRY_DELAY"
done
log "Database connection established"

# ---------- 3. Automatic Prisma migration ----------
log "Applying Prisma migrations..."
if bunx prisma migrate deploy; then
  log "Migrations applied"
else
  err "prisma migrate deploy failed"
  exit 1
fi

# ---------- 4. Seed only when database is empty ----------
# Uses the User table as the "is this DB empty" signal; adjust the
# model name if your schema's first-class table differs.
USER_COUNT=$(printf 'SELECT COUNT(*) FROM "User";' | bunx prisma db execute --stdin 2>/dev/null | tr -dc '0-9' || echo "")
if [ "${USER_COUNT:-0}" = "0" ]; then
  log "Database appears empty — running seed"
  bunx prisma db seed || err "Seed failed (continuing startup)"
else
  log "Database already has data (User count=${USER_COUNT}) — skipping seed"
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
