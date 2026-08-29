import { NextFunction, Request, Response } from 'express';
import { systemSettingService } from './system-setting.service';
import { SystemSettingQueryDto } from './system-setting.dto';

export class SystemSettingController {
  findAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = req.query as unknown as SystemSettingQueryDto;
      const settings = await systemSettingService.findAll(query);
      res.status(200).json({
        success: true,
        data: settings,
      });
    } catch (error) {
      next(error);
    }
  };

  findByKey = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { key } = req.params;
      const setting = await systemSettingService.findByKey(key);
      res.status(200).json({
        success: true,
        data: setting,
      });
    } catch (error) {
      next(error);
    }
  };

  updateSetting = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { key } = req.params;
      const dto = req.body;
      const actorId = req.user?.id;
      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const updated = await systemSettingService.updateSetting(
        key,
        dto,
        actorId,
        { ipAddress, userAgent },
      );

      res.status(200).json({
        success: true,
        data: updated,
        message: `Cập nhật cấu hình [${key}] thành công`,
      });
    } catch (error) {
      next(error);
    }
  };

  updateMaintenanceMode = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.body;
      const actorId = req.user?.id;
      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await systemSettingService.updateMaintenanceMode(
        input,
        actorId,
        { ipAddress, userAgent },
      );

      res.status(200).json({
        success: true,
        data: result,
        message: input.enabled
          ? 'Đã kích hoạt chế độ bảo trì hệ thống'
          : 'Đã tắt chế độ bảo trì hệ thống',
      });
    } catch (error) {
      next(error);
    }
  };

  getPublicConfig = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const config = await systemSettingService.getPublicConfig();
      res.status(200).json({
        success: true,
        data: config,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const systemSettingController = new SystemSettingController();
