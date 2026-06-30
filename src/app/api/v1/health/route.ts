import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/api';
import { config } from '@/lib/config';
import { providerRegistry } from '@/lib/ai-gateway/registry';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = process.hrtime.bigint();
  const checks: { [key: string]: any } = {};
  let overallStatus: 'ok' | 'degraded' | 'error' = 'ok';

  // Liveness check (always OK if process is running)
  checks.liveness = { status: 'ok' };

  // Readiness check (database connectivity)
  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = { status: 'connected' };
  } catch (error: any) {
    console.error('Health check: Database connection failed:', error);
    checks.database = { status: 'error', message: error.message };
    overallStatus = 'degraded';
  }

  // AI Provider connectivity check (optional)
  const configuredProviders = providerRegistry.getAllProviders().filter(p => providerRegistry.isInitialized(p));
  if (configuredProviders.length > 0) {
    checks.aiProviders = {};
    for (const providerType of configuredProviders) {
      try {
        const driver = providerRegistry.getDriver(providerType);
        if (driver && typeof driver.health === 'function') {
          const providerHealth = await driver.health();
          checks.aiProviders[providerType] = { status: 'ok', details: providerHealth };
        } else {
          checks.aiProviders[providerType] = { status: 'info', message: 'No specific health check implemented' };
        }
      } catch (error: any) {
        console.error(`Health check: AI Provider ${providerType} failed:`, error);
        checks.aiProviders[providerType] = { status: 'error', message: error.message };
        overallStatus = 'degraded';
      }
    }
  } else {
    checks.aiProviders = { status: 'info', message: 'No AI providers configured or initialized.' };
  }

  const endTime = process.hrtime.bigint();
  const responseTimeMs = Number(endTime - startTime) / 1_000_000;

  const responseBody = successResponse({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: config.app.version,
    uptime: process.uptime(),
    responseTimeMs: parseFloat(responseTimeMs.toFixed(2)),
    checks,
  });

  return NextResponse.json(responseBody, { status: overallStatus === 'ok' ? 200 : 503 });
}
