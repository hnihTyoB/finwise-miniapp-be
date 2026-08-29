import { Request, Response, NextFunction } from 'express';
import { UserService } from './user.service';
import { UserQueryDto, CreateUserDto, UpdateUserDto } from './user.dto';

export class UserController {
  private readonly service = new UserService();

  findAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as UserQueryDto;
      const result = await this.service.findAll(query);

      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  findById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.findById(req.params.id);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateUserDto;
      const result = await this.service.create(body);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as UpdateUserDto;
      const actorId = req.user?.id;
      const metadata = {
        ipAddress: req.ip || (req.headers['x-forwarded-for'] as string),
        userAgent: req.headers['user-agent'],
      };
      const result = await this.service.update(req.params.id, body, actorId, metadata);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  softDelete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const adminId = req.user.id;
      const metadata = {
        ipAddress: req.ip || (req.headers['x-forwarded-for'] as string),
        userAgent: req.headers['user-agent'],
      };
      await this.service.softDelete(id, adminId, metadata);

      res.json({
        success: true,
        message: 'User soft-deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  restore = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const actorId = req.user.id;
      const metadata = {
        ipAddress: req.ip || (req.headers['x-forwarded-for'] as string),
        userAgent: req.headers['user-agent'],
      };
      const result = await this.service.restore(id, actorId, metadata);

      res.json({
        success: true,
        data: result,
        message: 'Người dùng đã được khôi phục thành công',
      });
    } catch (error) {
      next(error);
    }
  };

  getAdminStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.getAdminStats();

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
