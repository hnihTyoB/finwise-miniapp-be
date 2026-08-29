import { NextFunction, Request, Response } from 'express';
import { adminNotificationService } from './admin-notification.service';
import { AdminDeliveryQueryDto, AdminTemplateQueryDto } from './admin-notification.dto';

export class AdminNotificationController {
  getOverviewStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string };
      const stats = await adminNotificationService.getOverviewStats(dateFrom, dateTo);
      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  };

  findDeliveries = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = req.query as unknown as AdminDeliveryQueryDto;
      const result = await adminNotificationService.findDeliveries(query);
      res.status(200).json({
        success: true,
        data: result.data,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  };

  retryDelivery = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const actorId = req.user?.id;
      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await adminNotificationService.retryDelivery(
        id,
        actorId,
        { ipAddress, userAgent },
      );

      res.status(200).json({
        success: true,
        data: result,
        message: 'Đã lên lịch thử lại gửi thông báo thành công',
      });
    } catch (error) {
      next(error);
    }
  };

  findTemplates = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = req.query as unknown as AdminTemplateQueryDto;
      const templates = await adminNotificationService.findTemplates(query);
      res.status(200).json({
        success: true,
        data: templates,
      });
    } catch (error) {
      next(error);
    }
  };

  updateTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const dto = req.body;
      const actorId = req.user?.id;
      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const updated = await adminNotificationService.updateTemplate(
        id,
        dto,
        actorId,
        { ipAddress, userAgent },
      );

      res.status(200).json({
        success: true,
        data: updated,
        message: 'Cập nhật mẫu thông báo thành công',
      });
    } catch (error) {
      next(error);
    }
  };

  getChannelConfig = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const config = await adminNotificationService.getChannelConfig();
      res.status(200).json({
        success: true,
        data: config,
      });
    } catch (error) {
      next(error);
    }
  };

  updateChannelConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = req.body;
      const actorId = req.user?.id;
      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const updated = await adminNotificationService.updateChannelConfig(
        dto,
        actorId,
        { ipAddress, userAgent },
      );

      res.status(200).json({
        success: true,
        data: updated,
        message: 'Cập nhật cấu hình kênh thông báo thành công',
      });
    } catch (error) {
      next(error);
    }
  };
}

export const adminNotificationController = new AdminNotificationController();
