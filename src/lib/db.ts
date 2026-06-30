import { PrismaClient } from '@prisma/client'
import { setupGlobalErrorHandling } from './errors';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Only log queries in development — production should be quiet for performance
const logLevel = process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['query', 'error', 'warn']

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: logLevel as any,
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// Graceful shutdown handling
if (typeof process !== 'undefined') {
  setupGlobalErrorHandling();
  const shutdown = async () => {
    console.log('Shutting down Prisma client...');
    await db.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}