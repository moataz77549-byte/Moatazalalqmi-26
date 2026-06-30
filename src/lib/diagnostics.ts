import { logger } from './logger';
import { db } from './db';
import { config } from './config';
import { providerRegistry } from './ai-gateway/registry';

export async function runStartupDiagnostics() {
  logger.info('Starting production diagnostics...');

  const diagnostics: Record<string, any> = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: config.app.version,
  };

  // 1. Database Check
  try {
    await db.$queryRaw`SELECT 1`;
    diagnostics.database = 'connected';
    logger.info('Database diagnostic: OK');
  } catch (error: any) {
    diagnostics.database = { status: 'failed', error: error.message };
    logger.error('Database diagnostic: FAILED', {}, error);
  }

  // 2. AI Providers Check
  const providers = providerRegistry.getAllProviders();
  diagnostics.aiProviders = providers.map(p => ({
    type: p,
    initialized: providerRegistry.isInitialized(p)
  }));
  logger.info(`AI Providers diagnostic: ${providers.length} providers registered`);

  // 3. Environment Check
  const missingRequired = [];
  if (!process.env.DATABASE_URL) missingRequired.push('DATABASE_URL');
  if (!process.env.JWT_SECRET) missingRequired.push('JWT_SECRET');
  if (!process.env.ENCRYPTION_MASTER_KEY) missingRequired.push('ENCRYPTION_MASTER_KEY');

  if (missingRequired.length > 0) {
    diagnostics.environment = { status: 'incomplete', missing: missingRequired };
    logger.warn('Environment diagnostic: MISSING REQUIRED VARIABLES', { missing: missingRequired });
  } else {
    diagnostics.environment = 'ok';
    logger.info('Environment diagnostic: OK');
  }

  logger.info('Startup diagnostics complete', diagnostics);
  return diagnostics;
}
