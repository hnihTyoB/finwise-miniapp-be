import { Router } from 'express';
import { AuthController } from './auth.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { authRateLimitMiddleware } from '../../middlewares/rate-limit.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { loginSchema, zaloLoginSchema, zaloLinkSchema, refreshSchema, logoutSchema, registerSchema, verifyEmailSchema, updateProfileSchema, updateAvatarSchema, updatePasswordSchema, forgotPasswordSchema, resetPasswordSchema, resendVerificationSchema, sessionParamsSchema, sessionQuerySchema, revokeOtherSessionsSchema, switchAccountSchema } from './auth.validation';

const router = Router();
const controller = new AuthController();

router.post('/register', authRateLimitMiddleware, validate(registerSchema), controller.register);
router.get('/verify-email', validate(verifyEmailSchema, 'query'), controller.verifyEmail);
router.post('/login', authRateLimitMiddleware, validate(loginSchema), controller.login);
router.post('/zalo-login', authRateLimitMiddleware, validate(zaloLoginSchema), controller.loginWithZalo);
router.get('/me', authMiddleware, controller.me);
router.post('/refresh', validate(refreshSchema), controller.refresh);
router.post('/switch', authRateLimitMiddleware, validate(switchAccountSchema), controller.switchAccount);
router.post('/logout', validate(logoutSchema), controller.logout);
router.put('/profile', authMiddleware, validate(updateProfileSchema), controller.updateProfile);
router.put('/avatar', authMiddleware, validate(updateAvatarSchema), controller.updateAvatar);
router.delete('/avatar', authMiddleware, controller.deleteAvatar);
router.put('/password', authMiddleware, validate(updatePasswordSchema), controller.updatePassword);
router.post('/forgot-password', authRateLimitMiddleware, validate(forgotPasswordSchema), controller.forgotPassword);
router.post('/reset-password', authRateLimitMiddleware, validate(resetPasswordSchema), controller.resetPassword);
router.post('/resend-verification', authRateLimitMiddleware, validate(resendVerificationSchema), controller.resendVerification);

// Session management
router.get('/sessions', authMiddleware, validate(sessionQuerySchema, 'query'), controller.getSessions);
router.delete('/sessions/:id', authMiddleware, validate(sessionParamsSchema, 'params'), controller.revokeSession);
router.delete('/sessions', authMiddleware, validate(revokeOtherSessionsSchema), controller.revokeOtherSessions);

// Zalo account linking (requires authentication — policy 6.5)
router.post('/zalo-link', authMiddleware, validate(zaloLinkSchema), controller.linkZaloAccount);
router.delete('/zalo-link', authMiddleware, controller.unlinkZaloAccount);

export default router;
