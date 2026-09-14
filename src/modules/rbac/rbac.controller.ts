import { Request, Response, NextFunction } from 'express';
import { RbacService } from './rbac.service';
import {
  CreateRoleDto,
  UpdateRoleDto,
  RoleQueryDto,
  AssignRolePermissionsDto,
  PermissionQueryDto,
  UserRoleUpdateDto,
} from './rbac.dto';

export class RbacController {
  private readonly service = new RbacService();

  // ==========================================
  // ROLES
  // ==========================================

  findAllRoles = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as RoleQueryDto;
      const result = await this.service.findAllRoles(query);
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  findRoleById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.findRoleById(req.params.id);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  createRole = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateRoleDto;
      const actorId = req.user?.id;
      const metadata = {
        ipAddress: req.ip || (req.headers['x-forwarded-for'] as string),
        userAgent: req.headers['user-agent'],
      };
      const result = await this.service.createRole(body, actorId, metadata);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  updateRole = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as UpdateRoleDto;
      const actorId = req.user?.id;
      const metadata = {
        ipAddress: req.ip || (req.headers['x-forwarded-for'] as string),
        userAgent: req.headers['user-agent'],
      };
      const result = await this.service.updateRole(req.params.id, body, actorId, metadata);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  deleteRole = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actorId = req.user?.id;
      const metadata = {
        ipAddress: req.ip || (req.headers['x-forwarded-for'] as string),
        userAgent: req.headers['user-agent'],
      };
      const result = await this.service.deleteRole(req.params.id, actorId, metadata);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // PERMISSIONS
  // ==========================================

  findAllPermissions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as PermissionQueryDto;
      const result = await this.service.findAllPermissions(query);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  getRolePermissions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.getRolePermissions(req.params.id);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  assignRolePermissions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { permissionIds } = req.body as AssignRolePermissionsDto;
      const actorId = req.user?.id;
      const metadata = {
        ipAddress: req.ip || (req.headers['x-forwarded-for'] as string),
        userAgent: req.headers['user-agent'],
      };
      const result = await this.service.assignRolePermissions(req.params.id, permissionIds, actorId, metadata);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  removeRolePermission = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actorId = req.user?.id;
      const metadata = {
        ipAddress: req.ip || (req.headers['x-forwarded-for'] as string),
        userAgent: req.headers['user-agent'],
      };
      const result = await this.service.removeRolePermission(
        req.params.id,
        req.params.permissionId,
        actorId,
        metadata
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // USER ROLE ASSIGNMENT
  // ==========================================

  updateUserRole = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { roleId } = req.body as UserRoleUpdateDto;
      const targetUserId = req.params.id;
      const actorId = req.user?.id;
      const metadata = {
        ipAddress: req.ip || (req.headers['x-forwarded-for'] as string),
        userAgent: req.headers['user-agent'],
      };
      const result = await this.service.updateUserRole(targetUserId, roleId, actorId, metadata);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };
}
