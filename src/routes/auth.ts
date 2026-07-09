import { Router } from 'express';
import * as authController from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { validate, schemas } from '../middleware/validation';

const router = Router();

/**
 * Public routes
 */
router.post('/register', validate(schemas.register), authController.register);
router.post('/login', validate(schemas.login), authController.login);
router.post('/refresh', validate(schemas.refreshToken), authController.refreshToken);
router.post('/forgot-password', validate(schemas.forgotPassword), authController.forgotPassword);
router.post('/reset-password', validate(schemas.resetPassword), authController.resetPassword);
router.get('/verify-email', authController.verifyEmail);

/**
 * Protected routes (require authentication)
 */
router.post('/logout', authenticate, authController.logout);
router.get('/profile', authenticate, authController.getProfile);
router.patch('/profile', authenticate, validate(schemas.updateProfile), authController.updateProfile);
router.post('/change-password', authenticate, validate(schemas.changePassword), authController.changePassword);
router.post('/resend-verification', authenticate, authController.resendVerificationEmail);

export default router;
