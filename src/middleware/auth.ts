import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { tokenService } from '../services/tokenService';
import { prisma } from '../utils/database';
import logger from '../utils/logger';

/**
 * Authentication middleware
 * Verifies JWT token and adds user info to request
 */
export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'No token provided',
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    const decoded = tokenService.verifyAccessToken(token);

    // Check if user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        message: 'Invalid token or user not found',
      });
      return;
    }

    // Add user info to request
    req.user = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (error) {
    logger.error('Authentication error', { error });

    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        res.status(401).json({
          success: false,
          message: 'Token expired',
        });
        return;
      }

      if (error.message.includes('Invalid')) {
        res.status(401).json({
          success: false,
          message: 'Invalid token',
        });
        return;
      }
    }

    res.status(500).json({
      success: false,
      message: 'Authentication failed',
    });
  }
};

/**
 * Authorization middleware
 * Checks if user has required role
 */
export const authorize = (roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
      return;
    }

    next();
  };
};

/**
 * Optional authentication middleware
 * Adds user info if token is provided but doesn't require it
 */
export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next(); // Continue without authentication
      return;
    }

    const token = authHeader.substring(7);
    const decoded = tokenService.verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    if (user && user.isActive) {
      req.user = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };
    }

    next();
  } catch (error) {
    // Ignore auth errors for optional auth
    next();
  }
};
