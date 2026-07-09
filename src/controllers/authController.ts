import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { authService } from '../services/authService';
import { getClientIp } from '../utils/crypto';
import { logger } from '@enekwe/icon-radar-shared';

/**
 * Register new user
 */
export const register = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'];

    const result = await authService.register(req.body, ipAddress, userAgent);

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please check your email to verify your account.',
      data: result,
    });
  } catch (error) {
    logger.error('Registration error', { error, email: req.body?.email });

    if (error instanceof Error) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Login user
 */
export const login = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'];

    const result = await authService.login(req.body, ipAddress, userAgent);

    res.json({
      success: true,
      message: 'Login successful',
      data: result,
    });
  } catch (error) {
    logger.error('Login error', { error, email: req.body?.email });

    if (error instanceof Error) {
      res.status(401).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Refresh access token
 */
export const refreshToken = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    const tokens = await authService.refreshToken(refreshToken);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: tokens,
    });
  } catch (error) {
    logger.error('Token refresh error', { error });

    if (error instanceof Error) {
      res.status(401).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Logout user (revoke session)
 */
export const logout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'No token provided',
      });
      return;
    }

    const accessToken = authHeader.substring(7);

    await authService.logout(accessToken);

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    logger.error('Logout error', { error, userId: req.user?.userId });

    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Get current user profile
 */
export const getProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
      return;
    }

    const user = await authService.getProfile(userId);

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    logger.error('Get profile error', { error, userId: req.user?.userId });

    if (error instanceof Error) {
      res.status(404).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Update user profile
 */
export const updateProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
      return;
    }

    const user = await authService.updateProfile(userId, req.body);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: user,
    });
  } catch (error) {
    logger.error('Update profile error', { error, userId: req.user?.userId });

    if (error instanceof Error) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Change password
 */
export const changePassword = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
      return;
    }

    const authHeader = req.headers.authorization;
    const currentAccessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : undefined;

    await authService.changePassword(userId, req.body, currentAccessToken);

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    logger.error('Change password error', { error, userId: req.user?.userId });

    if (error instanceof Error) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Forgot password (request reset)
 */
export const forgotPassword = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    await authService.forgotPassword(req.body);

    res.json({
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.',
    });
  } catch (error) {
    logger.error('Forgot password error', { error, email: req.body?.email });

    if (error instanceof Error && error.message.includes('Too many')) {
      res.status(429).json({
        success: false,
        message: error.message,
      });
      return;
    }

    // Always return success for security (prevent email enumeration)
    res.json({
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.',
    });
  }
};

/**
 * Reset password with token
 */
export const resetPassword = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    await authService.resetPassword(req.body);

    res.json({
      success: true,
      message: 'Password reset successfully. Please login with your new password.',
    });
  } catch (error) {
    logger.error('Reset password error', { error });

    if (error instanceof Error) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Verify email address
 */
export const verifyEmail = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Verification token is required',
      });
      return;
    }

    await authService.verifyEmail(token);

    res.json({
      success: true,
      message: 'Email verified successfully',
    });
  } catch (error) {
    logger.error('Email verification error', { error });

    if (error instanceof Error) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * Resend email verification
 */
export const resendVerificationEmail = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
      return;
    }

    await authService.resendVerificationEmail(userId);

    res.json({
      success: true,
      message: 'Verification email sent. Please check your inbox.',
    });
  } catch (error) {
    logger.error('Resend verification error', { error, userId: req.user?.userId });

    if (error instanceof Error) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};
