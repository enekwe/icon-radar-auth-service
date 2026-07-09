import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import authRoutes from './routes/auth';
import { prisma } from './utils/database';
import { emailService } from './services/emailService';
import logger from './utils/logger';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

/**
 * Middleware
 */

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Correlation ID middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();
  (req as any).correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  next();
});

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      correlationId: (req as any).correlationId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.headers['user-agent'],
    });
  });

  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/v1/auth', limiter);

// More strict rate limiting for sensitive endpoints
const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per hour
  skipSuccessfulRequests: true,
  message: 'Too many attempts, please try again later.',
});

app.use('/api/v1/auth/forgot-password', strictLimiter);
app.use('/api/v1/auth/reset-password', strictLimiter);

/**
 * Routes
 */
app.use('/api/v1/auth', authRoutes);

/**
 * Health check endpoints
 */
app.get('/health', async (req: Request, res: Response) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    // Check email service
    const emailConfigured = await emailService.verifyConnection();

    res.json({
      status: 'healthy',
      service: process.env.SERVICE_NAME || 'auth-service',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        database: 'connected',
        email: emailConfigured ? 'connected' : 'not configured',
      },
    });
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(503).json({
      status: 'unhealthy',
      service: process.env.SERVICE_NAME || 'auth-service',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.get('/health/ready', async (req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready' });
  } catch (error) {
    res.status(503).json({ status: 'not ready' });
  }
});

app.get('/health/live', (req: Request, res: Response) => {
  res.json({ status: 'alive' });
});

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path,
  });
});

/**
 * Error handler
 */
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error', {
    error: err,
    correlationId: (req as any).correlationId,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    success: false,
    message: 'Internal server error',
    correlationId: (req as any).correlationId,
  });
});

/**
 * Graceful shutdown
 */
const gracefulShutdown = async () => {
  logger.info('Received shutdown signal, closing server gracefully...');

  try {
    await prisma.$disconnect();
    logger.info('Database connection closed');

    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

/**
 * Start server
 */
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Auth service started`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    service: process.env.SERVICE_NAME || 'auth-service',
  });
});

// Handle server errors
server.on('error', (error: any) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} is already in use`);
    process.exit(1);
  } else {
    logger.error('Server error', { error });
    process.exit(1);
  }
});

export default app;
