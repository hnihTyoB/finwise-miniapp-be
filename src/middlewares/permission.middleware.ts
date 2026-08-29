import { Request, Response, NextFunction } from 'express';
import { AppError } from '../common/errors/app-error';
import { ERROR_CODE } from '../common/errors/error-code';
import { PermissionName } from '../common/constants/permission.constant';
import { rbacService } from '../modules/rbac/rbac.service';

/**
 * Enforces that the authenticated user possesses ALL of the specified permissions.
 */
export function requirePermission(...permissions: (PermissionName | string)[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      next(new AppError('Unauthorized', 401, ERROR_CODE.UNAUTHORIZED));
      return;
    }

    try {
      let userPermissions = req.user.permissions;
      if (!userPermissions) {
        userPermissions = await rbacService.getUserPermissions(req.user.id);
        req.user.permissions = userPermissions;
      }

      const hasAll = permissions.every((p) => userPermissions.includes(p));

      if (!hasAll) {
        next(
          new AppError(
            `Forbidden: Yêu cầu quyền [${permissions.join(', ')}]`,
            403,
            ERROR_CODE.FORBIDDEN
          )
        );
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Enforces that the authenticated user possesses AT LEAST ONE of the specified permissions.
 */
export function requireAnyPermission(...permissions: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      next(new AppError('Unauthorized', 401, ERROR_CODE.UNAUTHORIZED));
      return;
    }

    try {
      let userPermissions = req.user.permissions;
      if (!userPermissions) {
        userPermissions = await rbacService.getUserPermissions(req.user.id);
        req.user.permissions = userPermissions;
      }

      const hasAny = permissions.some((p) => userPermissions.includes(p));

      if (!hasAny) {
        next(
          new AppError(
            `Forbidden: Yêu cầu ít nhất một trong các quyền [${permissions.join(', ')}]`,
            403,
            ERROR_CODE.FORBIDDEN
          )
        );
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
