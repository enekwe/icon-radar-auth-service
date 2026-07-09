import { authService } from '../../src/services/authService';
import { prisma } from '../../src/utils/database';
import bcrypt from 'bcryptjs';

// Mock dependencies
jest.mock('../../src/utils/database');
jest.mock('../../src/services/tokenService');
jest.mock('../../src/services/emailService');
jest.mock('bcryptjs');

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should successfully register a new user', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'USER',
        password: 'hashedPassword',
        isActive: true,
        isEmailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');

      const result = await authService.register({
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Test User',
      });

      expect(result).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
      expect(prisma.user.create).toHaveBeenCalledTimes(1);
    });

    it('should throw error if user already exists', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'existing-user',
        email: 'test@example.com',
      });

      await expect(
        authService.register({
          email: 'test@example.com',
          password: 'Password123!',
        })
      ).rejects.toThrow('User already exists with this email');
    });

    it('should throw error for weak password', async () => {
      await expect(
        authService.register({
          email: 'test@example.com',
          password: 'weak',
        })
      ).rejects.toThrow('Password must be at least 8 characters long');
    });

    it('should throw error for invalid email', async () => {
      await expect(
        authService.register({
          email: 'invalid-email',
          password: 'Password123!',
        })
      ).rejects.toThrow('Invalid email format');
    });
  });

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'USER',
        password: 'hashedPassword',
        isActive: true,
        isEmailVerified: true,
        loginAttempts: 0,
        lockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);

      const result = await authService.login({
        email: 'test@example.com',
        password: 'Password123!',
      });

      expect(result).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-123' },
          data: expect.objectContaining({
            loginAttempts: 0,
            lockedUntil: null,
          }),
        })
      );
    });

    it('should throw error for non-existent user', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'nonexistent@example.com',
          password: 'Password123!',
        })
      ).rejects.toThrow('Invalid email or password');
    });

    it('should throw error for invalid password', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        password: 'hashedPassword',
        isActive: true,
        loginAttempts: 0,
        lockedUntil: null,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);

      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'WrongPassword123!',
        })
      ).rejects.toThrow('Invalid email or password');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            loginAttempts: 1,
          }),
        })
      );
    });

    it('should throw error for locked account', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        password: 'hashedPassword',
        isActive: true,
        loginAttempts: 5,
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'Password123!',
        })
      ).rejects.toThrow('Account is temporarily locked');
    });

    it('should throw error for inactive account', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        password: 'hashedPassword',
        isActive: false,
        loginAttempts: 0,
        lockedUntil: null,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'Password123!',
        })
      ).rejects.toThrow('Account is disabled');
    });
  });

  describe('changePassword', () => {
    it('should successfully change password', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        password: 'oldHashedPassword',
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock)
        .mockResolvedValueOnce(true) // current password valid
        .mockResolvedValueOnce(false); // new password different from current
      (bcrypt.hash as jest.Mock).mockResolvedValue('newHashedPassword');
      (prisma.passwordHistory.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);

      await authService.changePassword('user-123', {
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword123!',
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-123' },
          data: expect.objectContaining({
            password: 'newHashedPassword',
          }),
        })
      );
    });

    it('should throw error for incorrect current password', async () => {
      const mockUser = {
        id: 'user-123',
        password: 'hashedPassword',
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        authService.changePassword('user-123', {
          currentPassword: 'WrongPassword123!',
          newPassword: 'NewPassword123!',
        })
      ).rejects.toThrow('Current password is incorrect');
    });

    it('should throw error if new password is same as current', async () => {
      const mockUser = {
        id: 'user-123',
        password: 'hashedPassword',
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        authService.changePassword('user-123', {
          currentPassword: 'Password123!',
          newPassword: 'Password123!',
        })
      ).rejects.toThrow('New password must be different from current password');
    });
  });
});
