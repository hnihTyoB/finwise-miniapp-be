import { Request, Response, NextFunction } from 'express';
import { prisma } from '../database/prisma.client';
import { AppError } from '../common/errors/app-error';
import { ERROR_CODE } from '../common/errors/error-code';
import { hashApiKey } from '../common/helpers/crypto.helper';
import { rbacService } from '../modules/rbac/rbac.service';
import { ApiKeyStatus } from '@prisma/client';

/**
 * Middleware xác thực API Key từ hệ thống bên ngoài:
 * - Hỗ trợ Header: `X-API-Key: fw_live_...` hoặc `Authorization: Bearer fw_live_...` / `Authorization: ApiKey fw_live_...`
 * - Băm key bằng SHA-256 để tìm trong database
 * - Kiểm tra trạng thái isActive, expiration, deletedAt
 * - Nạp user sở hữu và gán vào `req.user`
 */
export async function apiKeyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  let rawKey: string | undefined;

  const xApiKey = req.headers['x-api-key'];
  if (typeof xApiKey === 'string' && xApiKey.trim()) {
    rawKey = xApiKey.trim();
  }

  if (!rawKey) {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      if (authHeader.startsWith('Bearer fw_') || authHeader.startsWith('ApiKey fw_')) {
        rawKey = authHeader.split(' ')[1]?.trim();
      }
    }
  }

  if (!rawKey) {
    next(new AppError('API Key is missing', 401, ERROR_CODE.UNAUTHORIZED));
    return;
  }

  try {
    const keyHash = hashApiKey(rawKey);

    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: {
        user: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!apiKey || apiKey.status !== ApiKeyStatus.ACTIVE || apiKey.deletedAt !== null) {
      next(new AppError('Invalid or revoked API Key', 401, ERROR_CODE.API_KEY_INVALID));
      return;
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      next(new AppError('API Key has expired', 401, ERROR_CODE.API_KEY_EXPIRED));
      return;
    }

    if (apiKey.ipWhitelist && apiKey.ipWhitelist.length > 0) {
      const isWildcard = apiKey.ipWhitelist.some((ip) => ip.trim() === '*');
      if (!isWildcard) {
        const forwarded = req.headers['x-forwarded-for'];
        const rawIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : (req.ip || req.socket.remoteAddress || '');
        const cleanClientIp = rawIp.replace(/^::ffff:/, '');

        const isAllowed = apiKey.ipWhitelist.some((allowedIp) => {
          const cleanAllowedIp = allowedIp.trim().replace(/^::ffff:/, '');
          return cleanClientIp === cleanAllowedIp || rawIp === allowedIp.trim();
        });

        if (!isAllowed) {
          next(new AppError(`Client IP (${rawIp}) is not in API Key whitelist`, 403, ERROR_CODE.FORBIDDEN));
          return;
        }
      }
    }

    const user = apiKey.user;
    if (!user || !user.isActive || user.deletedAt !== null) {
      next(new AppError('API Key owner account is inactive', 403, ERROR_CODE.USER_INACTIVE));
      return;
    }

    // Load user permissions from RBAC service cache
    let permissions = await rbacService.getUserPermissions(user.id);

    // If API key has scoped permissions restricted to a subset, intersect them
    if (apiKey.permissions && apiKey.permissions.length > 0) {
      permissions = permissions.filter((p) => apiKey.permissions.includes(p));
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role.name as any,
      permissions,
      apiKeyId: apiKey.id,
    };

    // Update lastUsedAt asynchronously without blocking request
    (async () => {
      try {
        await prisma.apiKey.update({
          where: { id: apiKey.id },
          data: { lastUsedAt: new Date() },
        });
      } catch (err) {
        console.error('Failed to update API key lastUsedAt:', err);
      }
    })();

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware cho phép xác thực linh hoạt: qua JWT Token (User UI) HOẶC qua API Key (External Integration).
 */
export async function authOrApiKeyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const hasApiKey = Boolean(req.headers['x-api-key'] || req.headers.authorization?.startsWith('Bearer fw_') || req.headers.authorization?.startsWith('ApiKey '));

  if (hasApiKey) {
    return apiKeyMiddleware(req, res, next);
  }

  // Fallback to standard JWT auth middleware
  const { authMiddleware } = await import('./auth.middleware');
  return authMiddleware(req, res, next);
}
