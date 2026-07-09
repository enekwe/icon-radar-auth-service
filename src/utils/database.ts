import { PrismaClient } from '@prisma/client';
import { logger } from '@enekwe/icon-radar-shared';

let _prismaInstance: PrismaClient | null = null;

export const getPrismaClient = (): PrismaClient => {
  if (!_prismaInstance) {
    _prismaInstance = new PrismaClient({
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' },
      ],
    });

    // Log slow queries in development
    if (process.env.NODE_ENV === 'development') {
      _prismaInstance.$on('query' as never, (e: any) => {
        const duration = typeof e.duration === 'string' ? parseFloat(e.duration) : e.duration;
        if (duration > 100) {
          logger.warn('Slow query detected', {
            query: e.query,
            duration,
            durationDisplay: `${duration}ms`,
          });
        }
      });
    }

    // Graceful shutdown
    process.on('beforeExit', async () => {
      await _prismaInstance?.$disconnect();
    });
  }

  return _prismaInstance;
};

export const prisma = getPrismaClient();
