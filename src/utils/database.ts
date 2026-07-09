import { PrismaClient } from '@prisma/client';
import logger from './logger';

let prisma: PrismaClient;

export const getPrismaClient = (): PrismaClient => {
  if (!prisma) {
    prisma = new PrismaClient({
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' },
      ],
    });

    // Log slow queries in development
    if (process.env.NODE_ENV === 'development') {
      prisma.$on('query' as never, (e: any) => {
        if (e.duration > 100) {
          logger.warn('Slow query detected', {
            query: e.query,
            duration: `${e.duration}ms`,
          });
        }
      });
    }

    // Graceful shutdown
    process.on('beforeExit', async () => {
      await prisma.$disconnect();
    });
  }

  return prisma;
};

export const prisma = getPrismaClient();
