import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../config/jwt.config';
import { AppError } from '../common/errors/app-error';
import { ERROR_CODE } from '../common/errors/error-code';
import { cacheService } from '../common/services/cache.service';
import { prisma } from '../database/prisma.client';

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  let token = req.cookies?.accessToken;

  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  // Allow query token ONLY for EventSource / SSE connection endpoints
  const isSseRequest = req.path.endsWith('/stream') || req.headers.accept?.includes('text/event-stream');
  if (!token && isSseRequest && typeof req.query?.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    next(new AppError('Unauthorized', 401, ERROR_CODE.UNAUTHORIZED));
    return;
  }

  try {
    const payload = jwt.verify(token, jwtConfig.accessSecret) as {
      id: string;
      email: string;
      role: string;
    };

    // Check user active status in cache first, fallback to DB
    const cacheKey = `finwise:user:status:${payload.id}`;
    let isUserActive = await cacheService.get<boolean>(cacheKey);

    if (isUserActive === null) {
      const user = await prisma.user.findUnique({
        where: { id: payload.id },
        select: { id: true, isActive: true, deletedAt: true },
      });

      isUserActive = Boolean(user && user.isActive && user.deletedAt === null);
      // Cache user status for 60 seconds
      await cacheService.set(cacheKey, isUserActive, 60);
    }

    if (!isUserActive) {
      next(
        new AppError(
          'User account is inactive or has been deleted',
          403,
          ERROR_CODE.USER_INACTIVE,
        ),
      );
      return;
    }

    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role as any,
    };

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }

    if (error instanceof jwt.TokenExpiredError) {
      next(new AppError('Token expired', 401, ERROR_CODE.TOKEN_EXPIRED));
    } else {
      next(new AppError('Invalid token', 401, ERROR_CODE.TOKEN_INVALID));
    }
  }
}
