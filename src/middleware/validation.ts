import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import logger from '../utils/logger';

/**
 * Validation schemas for auth requests
 */
export const schemas = {
  register: z.object({
    email: z.string().email('Invalid email format'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters long')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      ),
    name: z.string().optional(),
  }),

  login: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required'),
  }),

  refreshToken: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),

  changePassword: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters long')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
        'New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      ),
  }),

  forgotPassword: z.object({
    email: z.string().email('Invalid email format'),
  }),

  resetPassword: z.object({
    token: z.string().min(1, 'Reset token is required'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters long')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      ),
  }),

  updateProfile: z.object({
    name: z.string().optional(),
    email: z.string().email('Invalid email format').optional(),
  }),

  verifyEmail: z.object({
    token: z.string().min(1, 'Verification token is required'),
  }),
};

/**
 * Validation middleware factory
 */
export const validate = (schema: z.ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validate request body or query params
      const data = req.method === 'GET' ? req.query : req.body;
      const validated = await schema.parseAsync(data);

      // Replace request data with validated data
      if (req.method === 'GET') {
        req.query = validated as any;
      } else {
        req.body = validated;
      }

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn('Validation error', {
          errors: error.errors,
          path: req.path,
          method: req.method,
        });

        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: error.errors.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
        return;
      }

      logger.error('Unexpected validation error', { error });
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };
};
