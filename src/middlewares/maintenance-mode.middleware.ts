import jwt from 'jsonwebtoken';
import { NextFunction, Request, Response } from 'express';
import { ERROR_CODE } from '../common/errors/error-code';
import { PERMISSIONS } from '../common/constants/permission.constant';
import { envConfig } from '../config/env.config';
import { rbacService } from '../modules/rbac/rbac.service';
import { systemSettingService } from '../modules/system-settings/system-setting.service';

const WHITELIST_PATHS = [
  '/health',
  '/api/v1/health',
  '/api/v1/system/public-config',
  '/api/v1/auth/login',
  '/api/v1/auth/me',
  '/api/v1/auth/logout',
  '/api/v1/auth/refresh',
  '/api/docs',
];

const ADMIN_PATH_PREFIXES = [
  '/api/v1/admin',
  '/api/v1/roles',
  '/api/v1/permissions',
  '/api/v1/audit-logs',
];

export async function maintenanceModeMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const rawPath = req.path;
  const fullPath = (req.originalUrl || req.url || '').split('?')[0];

  // 1. Check if the path is explicitly whitelisted
  const isWhitelisted = WHITELIST_PATHS.some(
    (p) =>
      rawPath === p ||
      fullPath === p ||
      rawPath === p.replace(/^\/api\/v1/, '') ||
      fullPath === `/api/v1${p}`,
  );

  if (isWhitelisted) {
    next();
    return;
  }

  // 2. Check if the path is an admin path
  const isAdmin = ADMIN_PATH_PREFIXES.some(
    (prefix) =>
      rawPath.startsWith(prefix) ||
      fullPath.startsWith(prefix) ||
      rawPath.startsWith(prefix.replace(/^\/api\/v1/, '')),
  );

  if (isAdmin) {
    next();
    return;
  }


  try {
    const isMaintenance = await systemSettingService.getBoolean(
      'system.maintenance.enabled',
      false,
    );

    if (!isMaintenance) {
      next();
      return;
    }

    // 3. If user is authenticated, check if they have admin/maintenance bypass permissions
    let user = req.user;
    if (!user) {
      const authHeader = req.headers.authorization;
      const cookieToken = req.cookies?.accessToken;
      let token: string | undefined;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      } else if (cookieToken) {
        token = cookieToken;
      }
      if (token) {
        try {
          const payload = jwt.verify(token, envConfig.jwt.accessSecret) as {
            id: string;
            email?: string;
            roleId?: string;
            role?: string;
          };
          if (payload?.id) {
            const permissions = await rbacService.getUserPermissions(payload.id);
            user = {
              id: payload.id,
              email: payload.email || '',
              roleId: payload.roleId || '',
              role: payload.role || '',
              permissions,
            };
            req.user = user;
          }
        } catch {
          // Invalid or expired token; proceed to maintenance check
        }
      }
    }

    if (user) {
      let permissions = user.permissions;
      if (!permissions) {
        permissions = await rbacService.getUserPermissions(user.id);
        user.permissions = permissions;
      }

      const hasAdminBypass = [
        PERMISSIONS.MAINTENANCE_MODE_UPDATE,
        PERMISSIONS.SYSTEM_CONFIG_UPDATE,
        PERMISSIONS.SYSTEM_CONFIG_READ,
      ].some((p) => permissions.includes(p));

      if (hasAdminBypass) {
        next();
        return;
      }
    }

    // 4. Reject normal user request with 503 Maintenance Mode Active
    const [message, startAt, endAt] = await Promise.all([
      systemSettingService.getString(
        'system.maintenance.message',
        'Hệ thống FinWise đang bảo trì để nâng cấp định kỳ. Vui lòng quay lại sau ít phút.',
      ),
      systemSettingService.getString('system.maintenance.start_at', ''),
      systemSettingService.getString('system.maintenance.end_at', ''),
    ]);

    res.status(503).json({
      success: false,
      code: ERROR_CODE.MAINTENANCE_MODE_ACTIVE,
      message,
      maintenance: {
        enabled: true,
        message,
        startAt: startAt || null,
        endAt: endAt || null,
      },
    });
  } catch (error) {
    // If checking maintenance mode fails (e.g., db temporarily unstable), don't brick the request; pass to error handler
    next(error);
  }
}
