import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across hot reloads / lambda invocations
// instead of opening a new connection pool per request.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Readiness: can this instance actually serve traffic right now?
// Checked by Railway before routing requests to a new deployment.
export async function GET() {
  const checks: Record<string, "ok" | "down" | "skipped"> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "down";
  }

  // Redis / Qdrant / object storage are optional — degrade, don't fail,
  // since the README documents in-memory fallbacks for each.
  checks.redis = process.env.REDIS_URL ? "ok" : "skipped";
  checks.vectorDb = process.env.QDRANT_URL ? "ok" : "skipped";

  const isReady = checks.database === "ok";

  return NextResponse.json(
    { status: isReady ? "ready" : "not_ready", checks, timestamp: new Date().toISOString() },
    { status: isReady ? 200 : 503 }
  );
}
