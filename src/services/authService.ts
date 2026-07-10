import bcrypt from 'bcryptjs';
import { prisma } from '../utils/database';
import { tokenService } from './tokenService';
import { emailService } from './emailService';
import {
  RegisterRequest,
  LoginRequest,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  UpdateProfileRequest,
  TokenPair,
  UserResponse,
} from '../types';
import {
  generateSecureToken,
  calculateExpirationDate,
  getClientIp,
  sanitizeUser,
  validatePasswordStrength,
  validateEmail,
} from '../utils/crypto';
import { logger } from '@enekwe/icon-radar-shared';

const PASSWORD_RESET_EXPIRY_MS = parseInt(process.env.PASSWORD_RESET_EXPIRY_MS || '3600000', 10); // 1 hour
const EMAIL_VERIFICATION_EXPIRY_MS = parseInt(
  process.env.EMAIL_VERIFICATION_EXPIRY_MS || '86400000',
  10
); // 24 hours
const MAX_PASSWORD_HISTORY = parseInt(process.env.MAX_PASSWORD_HISTORY || '5', 10);
const MAX_PASSWORD_RESET_ATTEMPTS = parseInt(
  process.env.MAX_PASSWORD_RESET_ATTEMPTS || '5',
  10
);
const ACCOUNT_LOCKOUT_DURATION_MS = parseInt(
  process.env.ACCOUNT_LOCKOUT_DURATION_MS || '900000',
  10
); // 15 minutes
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '15m';
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';

export class AuthService {
  /**
   * Check if password was used before
   */
  private async isPasswordReused(userId: string, newPassword: string): Promise<boolean> {
    try {
      const passwordHistory = await prisma.passwordHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: MAX_PASSWORD_HISTORY,
      });

      for (const record of passwordHistory) {
        const matches = await bcrypt.compare(newPassword, record.passwordHash);
        if (matches) {
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error('Error checking password history', { error, userId });
      return false; // Allow password change if history check fails
    }
  }

  /**
   * Save password to history
   */
  private async savePasswordToHistory(userId: string, passwordHash: string): Promise<void> {
    try {
      await prisma.passwordHistory.create({
        data: { userId, passwordHash },
      });

      // Clean up old password history (keep only MAX_PASSWORD_HISTORY entries)
      const allHistory = await prisma.passwordHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      if (allHistory.length > MAX_PASSWORD_HISTORY) {
        const toDelete = allHistory.slice(MAX_PASSWORD_HISTORY);
        await prisma.passwordHistory.deleteMany({
          where: {
            id: { in: toDelete.map((h) => h.id) },
          },
        });
      }
    } catch (error) {
      logger.error('Error saving password history', { error, userId });
    }
  }

  /**
   * Register new user
   */
  async register(
    data: RegisterRequest,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ tokens: TokenPair; user: UserResponse }> {
    const { email, password, name } = data;

    logger.info('Registration attempt', { email });

    // Validate email
    if (!validateEmail(email)) {
      throw new Error('Invalid email format');
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.message);
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      throw new Error('User already exists with this email');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate email verification token
    const emailVerificationToken = generateSecureToken();
    const emailVerificationExpires = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        name: name || email.split('@')[0],
        role: 'USER',
        isActive: true,
        isEmailVerified: false,
        emailVerificationToken,
        emailVerificationExpires,
      },
    });

    // Save initial password to history
    await this.savePasswordToHistory(user.id, hashedPassword);

    // Generate tokens
    const tokens = tokenService.generateTokenPair(user.id, user.email, user.role);

    // Create session
    const accessExpiresAt = calculateExpirationDate(ACCESS_TOKEN_EXPIRY);
    const refreshExpiresAt = calculateExpirationDate(REFRESH_TOKEN_EXPIRY);

    await tokenService.createSession({
      userId: user.id,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessExpiresAt,
      refreshExpiresAt,
      ipAddress,
      userAgent,
    });

    // Send verification email
    const verificationUrl = `${
      process.env.FRONTEND_URL || 'http://localhost:5173'
    }/verify-email?token=${emailVerificationToken}`;

    try {
      await emailService.sendVerificationEmail({
        email: user.email,
        name: user.name || user.email,
        verificationUrl,
      });
      logger.info('Verification email sent', { userId: user.id, email: user.email });
    } catch (emailError) {
      logger.error('Failed to send verification email', { error: emailError, userId: user.id });
      // Don't fail registration if email fails
    }

    logger.info('Registration successful', { userId: user.id, email });

    return {
      tokens,
      user: sanitizeUser(user) as UserResponse,
    };
  }

  /**
   * Login user
   */
  async login(
    data: LoginRequest,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ tokens: TokenPair; user: UserResponse }> {
    const { email, password } = data;

    logger.info('Login attempt', { email });

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      logger.warn('Login failed: user not found', { email });
      throw new Error('Invalid email or password');
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      logger.warn('Login failed: account locked', { email });
      throw new Error('Account is temporarily locked. Please try again later.');
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      // Increment failed login attempts
      const newAttempts = user.loginAttempts + 1;
      const updateData: any = { loginAttempts: newAttempts };

      // Lock account after 5 failed attempts
      if (newAttempts >= 5) {
        updateData.lockedUntil = new Date(Date.now() + ACCOUNT_LOCKOUT_DURATION_MS);
      }

      await prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });

      logger.warn('Login failed: invalid password', { email, attempts: newAttempts });
      throw new Error('Invalid email or password');
    }

    // Check if user is active
    if (!user.isActive) {
      logger.warn('Login failed: user inactive', { email });
      throw new Error('Account is disabled');
    }

    // Generate tokens
    const tokens = tokenService.generateTokenPair(user.id, user.email, user.role);

    // Create session
    const accessExpiresAt = calculateExpirationDate(ACCESS_TOKEN_EXPIRY);
    const refreshExpiresAt = calculateExpirationDate(REFRESH_TOKEN_EXPIRY);

    await tokenService.createSession({
      userId: user.id,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessExpiresAt,
      refreshExpiresAt,
      ipAddress,
      userAgent,
    });

    // Reset login attempts and update last login
    await prisma.user.update({
      where: { id: user.id },
      data: {
        loginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    logger.info('Login successful', { userId: user.id, email });

    return {
      tokens,
      user: sanitizeUser(user) as UserResponse,
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<TokenPair> {
    // Verify refresh token
    const decoded = tokenService.verifyRefreshToken(refreshToken);

    // Find session
    const session = await tokenService.getSessionByRefreshToken(refreshToken);

    if (!session || session.isRevoked) {
      throw new Error('Invalid session');
    }

    // Check if refresh token is expired
    if (session.refreshExpiresAt < new Date()) {
      await tokenService.revokeSession(session.accessToken);
      throw new Error('Refresh token expired');
    }

    const user = session.user;

    // Check if user is active
    if (!user.isActive) {
      throw new Error('Account is disabled');
    }

    // Generate new tokens (token rotation)
    const newTokens = tokenService.generateTokenPair(user.id, user.email, user.role);

    // Update session with new tokens
    await tokenService.updateSession(refreshToken, newTokens.accessToken, newTokens.refreshToken);

    logger.info('Token refreshed successfully', { userId: user.id });

    return newTokens;
  }

  /**
   * Logout user (revoke session)
   */
  async logout(accessToken: string): Promise<void> {
    await tokenService.revokeSession(accessToken);
  }

  /**
   * Get user profile
   */
  async getProfile(userId: string): Promise<UserResponse> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        isEmailVerified: true,
        emailVerifiedAt: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    data: UpdateProfileRequest
  ): Promise<UserResponse> {
    const { name, email } = data;

    // Check if email is being changed
    if (email) {
      if (!validateEmail(email)) {
        throw new Error('Invalid email format');
      }

      const existingUser = await prisma.user.findFirst({
        where: {
          email: email.toLowerCase(),
          NOT: { id: userId },
        },
      });

      if (existingUser) {
        throw new Error('Email already in use');
      }
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) {
      updateData.email = email.toLowerCase();
      // Reset email verification if email changed
      updateData.isEmailVerified = false;
      updateData.emailVerificationToken = generateSecureToken();
      updateData.emailVerificationExpires = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS);
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        isEmailVerified: true,
        emailVerifiedAt: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Send verification email if email changed
    if (email && updateData.emailVerificationToken) {
      const verificationUrl = `${
        process.env.FRONTEND_URL || 'http://localhost:5173'
      }/verify-email?token=${updateData.emailVerificationToken}`;

      try {
        await emailService.sendVerificationEmail({
          email: user.email,
          name: user.name || user.email,
          verificationUrl,
        });
      } catch (emailError) {
        logger.error('Failed to send verification email', { error: emailError, userId });
      }
    }

    logger.info('Profile updated', { userId });

    return user;
  }

  /**
   * Change password
   */
  async changePassword(
    userId: string,
    data: ChangePasswordRequest,
    currentAccessToken?: string
  ): Promise<void> {
    const { currentPassword, newPassword } = data;

    // Validate password strength
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.message);
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);

    if (!isValidPassword) {
      logger.warn('Change password failed: invalid current password', { userId });
      throw new Error('Current password is incorrect');
    }

    // Check if new password is same as current
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      throw new Error('New password must be different from current password');
    }

    // Check password history
    const isReused = await this.isPasswordReused(userId, newPassword);
    if (isReused) {
      throw new Error('Password has been used recently. Please choose a different password.');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    // Save to password history
    await this.savePasswordToHistory(userId, hashedPassword);

    // Revoke all existing sessions except current one
    if (currentAccessToken) {
      await tokenService.revokeAllUserSessions(userId, currentAccessToken);
    }

    // Send notification email
    try {
      await emailService.sendPasswordChangedNotification(user.email, user.name || user.email);
    } catch (emailError) {
      logger.error('Failed to send password changed notification', {
        error: emailError,
        userId,
      });
    }

    logger.info('Password changed successfully', { userId });
  }

  /**
   * Forgot password (request reset)
   */
  async forgotPassword(data: ForgotPasswordRequest): Promise<void> {
    const { email } = data;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      logger.info('Password reset requested for non-existent email', { email });
      return;
    }

    // Rate limiting: Check reset attempts
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (
      user.lastPasswordResetAt &&
      user.lastPasswordResetAt > oneHourAgo &&
      user.passwordResetAttempts >= MAX_PASSWORD_RESET_ATTEMPTS
    ) {
      logger.warn('Password reset rate limit exceeded', { email, userId: user.id });
      throw new Error('Too many password reset requests. Please try again later.');
    }

    // Generate reset token
    const resetToken = generateSecureToken();
    const resetExpires = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);

    // Update user with reset token
    const resetAttempts =
      user.lastPasswordResetAt && user.lastPasswordResetAt > oneHourAgo
        ? user.passwordResetAttempts + 1
        : 1;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpires: resetExpires,
        passwordResetAttempts: resetAttempts,
        lastPasswordResetAt: new Date(),
      },
    });

    // Send reset email
    const resetUrl = `${
      process.env.FRONTEND_URL || 'http://localhost:5173'
    }/reset-password?token=${resetToken}`;

    try {
      await emailService.sendPasswordResetEmail({
        email: user.email,
        name: user.name || user.email,
        resetUrl,
      });
      logger.info('Password reset email sent', { userId: user.id, email });
    } catch (emailError) {
      logger.error('Failed to send password reset email', { error: emailError, userId: user.id });
      // Don't reveal email send failure to client
    }
  }

  /**
   * Reset password with token
   */
  async resetPassword(data: ResetPasswordRequest): Promise<void> {
    const { token, password } = data;

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.message);
    }

    // Find user by reset token
    const user = await prisma.user.findUnique({
      where: { passwordResetToken: token },
    });

    if (!user) {
      logger.warn('Invalid password reset token', { token });
      throw new Error('Invalid or expired reset token');
    }

    // Check if token is expired
    if (!user.passwordResetExpires || user.passwordResetExpires < new Date()) {
      logger.warn('Expired password reset token', { userId: user.id });
      throw new Error('Reset token has expired. Please request a new one.');
    }

    // Check password history
    const isReused = await this.isPasswordReused(user.id, password);
    if (isReused) {
      throw new Error('Password has been used recently. Please choose a different password.');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update password and clear reset token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null,
        passwordResetAttempts: 0,
        loginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Save to password history
    await this.savePasswordToHistory(user.id, hashedPassword);

    // Revoke all existing sessions
    await tokenService.revokeAllUserSessions(user.id);

    // Send notification email
    try {
      await emailService.sendPasswordChangedNotification(user.email, user.name || user.email);
    } catch (emailError) {
      logger.error('Failed to send password changed notification', {
        error: emailError,
        userId: user.id,
      });
    }

    logger.info('Password reset successful', { userId: user.id });
  }

  /**
   * Verify email address
   */
  async verifyEmail(token: string): Promise<void> {
    // Find user by verification token
    const user = await prisma.user.findUnique({
      where: { emailVerificationToken: token },
    });

    if (!user) {
      logger.warn('Invalid email verification token', { token });
      throw new Error('Invalid or expired verification token');
    }

    // Check if token is expired
    if (!user.emailVerificationExpires || user.emailVerificationExpires < new Date()) {
      logger.warn('Expired email verification token', { userId: user.id });
      throw new Error('Verification token has expired. Please request a new one.');
    }

    // Check if already verified
    if (user.isEmailVerified) {
      return; // Already verified
    }

    // Verify email
    await prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });

    logger.info('Email verified successfully', { userId: user.id });
  }

  /**
   * Resend email verification
   */
  async resendVerificationEmail(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.isEmailVerified) {
      return; // Already verified
    }

    // Generate new verification token
    const emailVerificationToken = generateSecureToken();
    const emailVerificationExpires = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS);

    await prisma.user.update({
      where: { id: userId },
      data: {
        emailVerificationToken,
        emailVerificationExpires,
      },
    });

    // Send verification email
    const verificationUrl = `${
      process.env.FRONTEND_URL || 'http://localhost:5173'
    }/verify-email?token=${emailVerificationToken}`;

    await emailService.sendVerificationEmail({
      email: user.email,
      name: user.name || user.email,
      verificationUrl,
    });

    logger.info('Verification email resent', { userId });
  }
}

export const authService = new AuthService();
