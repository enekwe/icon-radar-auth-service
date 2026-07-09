import jwt from 'jsonwebtoken';
import { JWTPayload, TokenPair, SessionInfo } from '../types';
import { prisma } from '../utils/database';
import { calculateExpirationDate } from '../utils/crypto';
import logger from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '15m';
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';

export class TokenService {
  /**
   * Generate access token
   */
  generateAccessToken(userId: string, email: string, role: string): string {
    return jwt.sign({ userId, email, role }, JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });
  }

  /**
   * Generate refresh token
   */
  generateRefreshToken(userId: string): string {
    return jwt.sign({ userId }, JWT_REFRESH_SECRET, {
      expiresIn: REFRESH_TOKEN_EXPIRY,
    });
  }

  /**
   * Generate token pair (access + refresh)
   */
  generateTokenPair(userId: string, email: string, role: string): TokenPair {
    return {
      accessToken: this.generateAccessToken(userId, email, role),
      refreshToken: this.generateRefreshToken(userId),
    };
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, JWT_SECRET) as JWTPayload;
    } catch (error) {
      throw new Error('Invalid or expired access token');
    }
  }

  /**
   * Verify refresh token
   */
  verifyRefreshToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, JWT_REFRESH_SECRET) as JWTPayload;
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  }

  /**
   * Create session in database
   */
  async createSession(sessionInfo: SessionInfo): Promise<void> {
    try {
      await prisma.session.create({
        data: {
          userId: sessionInfo.userId,
          accessToken: sessionInfo.accessToken,
          refreshToken: sessionInfo.refreshToken,
          accessExpiresAt: sessionInfo.accessExpiresAt,
          refreshExpiresAt: sessionInfo.refreshExpiresAt,
          ipAddress: sessionInfo.ipAddress,
          userAgent: sessionInfo.userAgent,
        },
      });

      logger.info('Session created', { userId: sessionInfo.userId });
    } catch (error) {
      logger.error('Failed to create session', { error, userId: sessionInfo.userId });
      throw error;
    }
  }

  /**
   * Update session with new tokens (token rotation)
   */
  async updateSession(
    oldRefreshToken: string,
    newAccessToken: string,
    newRefreshToken: string
  ): Promise<void> {
    try {
      const accessExpiresAt = calculateExpirationDate(ACCESS_TOKEN_EXPIRY);
      const refreshExpiresAt = calculateExpirationDate(REFRESH_TOKEN_EXPIRY);

      await prisma.session.update({
        where: { refreshToken: oldRefreshToken },
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          accessExpiresAt,
          refreshExpiresAt,
          lastUsedAt: new Date(),
        },
      });

      logger.info('Session updated with new tokens');
    } catch (error) {
      logger.error('Failed to update session', { error });
      throw error;
    }
  }

  /**
   * Revoke session by access token
   */
  async revokeSession(accessToken: string): Promise<void> {
    try {
      const session = await prisma.session.findUnique({
        where: { accessToken },
      });

      if (session) {
        await prisma.session.update({
          where: { id: session.id },
          data: {
            isRevoked: true,
            revokedAt: new Date(),
          },
        });

        logger.info('Session revoked', { sessionId: session.id });
      }
    } catch (error) {
      logger.error('Failed to revoke session', { error });
      throw error;
    }
  }

  /**
   * Revoke all user sessions except current one
   */
  async revokeAllUserSessions(userId: string, exceptToken?: string): Promise<number> {
    try {
      const where: any = {
        userId,
        isRevoked: false,
      };

      if (exceptToken) {
        where.accessToken = { not: exceptToken };
      }

      const result = await prisma.session.updateMany({
        where,
        data: {
          isRevoked: true,
          revokedAt: new Date(),
        },
      });

      logger.info('User sessions revoked', {
        userId,
        count: result.count,
      });

      return result.count;
    } catch (error) {
      logger.error('Failed to revoke user sessions', { error, userId });
      throw error;
    }
  }

  /**
   * Get session by refresh token
   */
  async getSessionByRefreshToken(refreshToken: string) {
    try {
      return await prisma.session.findUnique({
        where: { refreshToken },
        include: { user: true },
      });
    } catch (error) {
      logger.error('Failed to get session', { error });
      throw error;
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const result = await prisma.session.deleteMany({
        where: {
          OR: [
            { refreshExpiresAt: { lt: new Date() } },
            {
              isRevoked: true,
              revokedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // 30 days old
            },
          ],
        },
      });

      logger.info('Expired sessions cleaned up', { count: result.count });
      return result.count;
    } catch (error) {
      logger.error('Failed to cleanup expired sessions', { error });
      throw error;
    }
  }

  /**
   * Get active sessions for user
   */
  async getUserActiveSessions(userId: string) {
    try {
      return await prisma.session.findMany({
        where: {
          userId,
          isRevoked: false,
          refreshExpiresAt: { gt: new Date() },
        },
        orderBy: { lastUsedAt: 'desc' },
        select: {
          id: true,
          ipAddress: true,
          userAgent: true,
          lastUsedAt: true,
          createdAt: true,
        },
      });
    } catch (error) {
      logger.error('Failed to get user sessions', { error, userId });
      throw error;
    }
  }
}

export const tokenService = new TokenService();
