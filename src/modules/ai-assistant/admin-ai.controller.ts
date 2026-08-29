import { NextFunction, Request, Response } from 'express';
import { adminAiService } from './admin-ai.service';
import { AiRequestLogQueryDto } from './admin-ai.dto';

export class AdminAiController {
  getFeatureStatuses = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const statuses = await adminAiService.getFeatureStatuses();
      res.status(200).json({
        success: true,
        data: statuses,
      });
    } catch (error) {
      next(error);
    }
  };

  toggleFeature = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { feature } = req.params;
      const { enabled } = req.body;
      const actorId = req.user?.id;
      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await adminAiService.toggleFeature(
        feature,
        enabled,
        actorId,
        { ipAddress, userAgent },
      );

      res.status(200).json({
        success: true,
        data: result,
        message: `${enabled ? 'Đã kích hoạt' : 'Đã tạm dừng'} tính năng [${result.name}] thành công`,
      });
    } catch (error) {
      next(error);
    }
  };

  getUsageSummary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { period } = req.query as { period?: 'today' | 'week' | 'month' };
      const summary = await adminAiService.getUsageSummary(period);
      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (error) {
      next(error);
    }
  };

  findLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = req.query as unknown as AiRequestLogQueryDto;
      const result = await adminAiService.findLogs(query);
      res.status(200).json({
        success: true,
        data: result.data,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  };

  getRateLimitConfig = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const config = await adminAiService.getRateLimitConfig();
      res.status(200).json({
        success: true,
        data: config,
      });
    } catch (error) {
      next(error);
    }
  };

  updateRateLimitConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = req.body;
      const actorId = req.user?.id;
      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const config = await adminAiService.updateRateLimitConfig(
        dto,
        actorId,
        { ipAddress, userAgent },
      );

      res.status(200).json({
        success: true,
        data: config,
        message: 'Cập nhật giới hạn AI Rate Limit thành công',
      });
    } catch (error) {
      next(error);
    }
  };
}

export const adminAiController = new AdminAiController();
