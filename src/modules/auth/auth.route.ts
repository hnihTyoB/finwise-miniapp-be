import { Router } from 'express';
import { AuthController } from './auth.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { loginSchema, zaloLoginSchema, refreshSchema, logoutSchema, registerSchema, verifyEmailSchema, updateProfileSchema, updateAvatarSchema, updatePasswordSchema, forgotPasswordSchema, resetPasswordSchema, resendVerificationSchema, sessionParamsSchema, sessionQuerySchema, revokeOtherSessionsSchema } from './auth.validation';

const router = Router();
const controller = new AuthController();

router.post('/register', validate(registerSchema), controller.register);
router.get('/verify-email', validate(verifyEmailSchema, 'query'), controller.verifyEmail);
router.post('/login', validate(loginSchema), controller.login);
router.post('/zalo-login', validate(zaloLoginSchema), controller.loginWithZalo);
router.get('/me', authMiddleware, controller.me);
router.post('/refresh', validate(refreshSchema), controller.refresh);
router.post('/logout', validate(logoutSchema), controller.logout);
router.put('/profile', authMiddleware, validate(updateProfileSchema), controller.updateProfile);
router.put('/avatar', authMiddleware, validate(updateAvatarSchema), controller.updateAvatar);
router.delete('/avatar', authMiddleware, controller.deleteAvatar);
router.put('/password', authMiddleware, validate(updatePasswordSchema), controller.updatePassword);
router.post('/forgot-password', validate(forgotPasswordSchema), controller.forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), controller.resetPassword);
router.post('/resend-verification', validate(resendVerificationSchema), controller.resendVerification);

// Session management
router.get('/sessions', authMiddleware, validate(sessionQuerySchema, 'query'), controller.getSessions);
router.delete('/sessions/:id', authMiddleware, validate(sessionParamsSchema, 'params'), controller.revokeSession);
router.delete('/sessions', authMiddleware, validate(revokeOtherSessionsSchema), controller.revokeOtherSessions);

export default router;
