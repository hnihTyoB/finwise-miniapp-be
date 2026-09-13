import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, ZaloLoginDto, RegisterDto, UpdateProfileDto, UpdateAvatarDto, UpdatePasswordDto, ForgotPasswordDto, ResetPasswordDto, ResendVerificationDto, SessionQueryDto } from './auth.dto';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';

export class AuthController {
  private readonly service = new AuthService();

  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as LoginDto;
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip;
      const result = await this.service.login(body, { userAgent, ipAddress });

      res.cookie('accessToken', result.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 60 * 1000, // 30 minutes (matches JWT_ACCESS_EXPIRES_IN)
      });

      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      res.json({
        success: true,
        data: {
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  me = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.getMe(req.user.id);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;
      if (!refreshToken) {
        throw new AppError('Refresh token is required', 400, ERROR_CODE.TOKEN_INVALID);
      }

      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip;
      const result = await this.service.refresh(refreshToken, { userAgent, ipAddress });

      res.cookie('accessToken', result.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 60 * 1000, // 30 minutes
      });

      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.json({
        success: true,
        data: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;
      if (refreshToken) {
        await this.service.logout(refreshToken);
      }

      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');

      res.json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as RegisterDto;
      await this.service.register(body);

      res.status(201).json({
        success: true,
        message: 'Registration successful. Please check your email to verify your account.',
      });
    } catch (error) {
      next(error);
    }
  };

  verifyEmail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token } = req.query;
      await this.service.verifyEmail(token as string);

      res.json({
        success: true,
        message: 'Email verified successfully. You can now log in.',
      });
    } catch (error) {
      next(error);
    }
  };

  updateProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as UpdateProfileDto;
      const result = await this.service.updateProfile(req.user.id, body);

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  updateAvatar = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as UpdateAvatarDto;
      const result = await this.service.updateAvatar(req.user.id, body);

      res.json({
        success: true,
        message: 'Avatar updated successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  deleteAvatar = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.updateAvatar(req.user.id, { avatarUrl: null });

      res.json({
        success: true,
        message: 'Avatar deleted successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  updatePassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as UpdatePasswordDto;
      await this.service.updatePassword(req.user.id, body);

      res.json({
        success: true,
        message: 'Password updated successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as ForgotPasswordDto;
      await this.service.forgotPassword(body);

      res.json({
        success: true,
        message: 'Password reset link sent to your email',
      });
    } catch (error) {
      next(error);
    }
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as ResetPasswordDto;
      await this.service.resetPassword(body);

      res.json({
        success: true,
        message: 'Password has been reset successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  resendVerification = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as ResendVerificationDto;
      await this.service.resendVerification(body);

      res.json({
        success: true,
        message: 'Verification email sent successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  getSessions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const currentToken =
        req.cookies?.refreshToken ||
        req.body?.refreshToken ||
        (req.headers['x-refresh-token'] as string | undefined) ||
        (req.query?.refreshToken as string | undefined);
      const query = req.query as unknown as SessionQueryDto;
      const result = await this.service.getActiveSessions(req.user.id, currentToken, query);
      res.json({
        success: true,
        data: result.data,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  };

  revokeSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      await this.service.revokeSession(req.user.id, id);
      res.json({
        success: true,
        message: 'Session revoked successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  revokeOtherSessions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const currentToken =
        req.cookies?.refreshToken ||
        req.body?.refreshToken ||
        (req.headers['x-refresh-token'] as string | undefined) ||
        (req.query?.refreshToken as string | undefined);
      if (!currentToken) {
        throw new AppError('Current session token is required', 400, ERROR_CODE.TOKEN_INVALID);
      }
      await this.service.revokeAllOtherSessions(req.user.id, currentToken);
      res.json({
        success: true,
        message: 'All other sessions revoked successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  loginWithZalo = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as ZaloLoginDto;
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip;
      const result = await this.service.loginWithZalo(body, { userAgent, ipAddress });

      res.cookie('accessToken', result.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 60 * 1000, // 30 minutes
      });

      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.json({
        success: true,
        data: {
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}
