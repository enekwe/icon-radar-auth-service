import crypto from 'crypto';

/**
 * Generate secure random token for password reset and email verification
 */
export const generateSecureToken = (length: number = 32): string => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Calculate token expiration date from expiry string (e.g., '15m', '1h', '7d')
 */
export const calculateExpirationDate = (expiryString: string): Date => {
  const now = new Date();
  const match = expiryString.match(/(\d+)([mhd])/);

  if (!match) {
    return new Date(now.getTime() + 15 * 60 * 1000); // Default 15 minutes
  }

  const [, amount, unit] = match;
  const value = parseInt(amount, 10);

  switch (unit) {
    case 'm': // minutes
      return new Date(now.getTime() + value * 60 * 1000);
    case 'h': // hours
      return new Date(now.getTime() + value * 60 * 60 * 1000);
    case 'd': // days
      return new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() + 15 * 60 * 1000);
  }
};

/**
 * Get client IP address from request
 */
export const getClientIp = (req: any): string => {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
    req.socket.remoteAddress ||
    'unknown'
  );
};

/**
 * Sanitize user object (remove sensitive fields)
 */
export const sanitizeUser = (user: any) => {
  const {
    password,
    passwordResetToken,
    passwordResetExpires,
    emailVerificationToken,
    emailVerificationExpires,
    twoFactorSecret,
    loginAttempts,
    passwordResetAttempts,
    lockedUntil,
    ...sanitized
  } = user;
  return sanitized;
};

/**
 * Validate password strength
 */
export const validatePasswordStrength = (password: string): { valid: boolean; message?: string } => {
  if (password.length < 8) {
    return {
      valid: false,
      message: 'Password must be at least 8 characters long',
    };
  }

  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(password)) {
    return {
      valid: false,
      message:
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    };
  }

  return { valid: true };
};

/**
 * Validate email format
 */
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};
