import { NextFunction, Request, Response } from 'express';
import {
  NotificationQueryDto,
  UpdateNotificationSettingDto,
} from './notification.dto';
import { NotificationService } from './notification.service';

export class NotificationController {
  private readonly service = new NotificationService();

  findAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.findAll(
        req.user.id,
        req.query as unknown as NotificationQueryDto,
      );
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  unreadCount = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const count = await this.service.unreadCount(req.user.id);
      res.json({ success: true, data: { count } });
    } catch (error) {
      next(error);
    }
  };

  markRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const notification = await this.service.markRead(req.user.id, req.params.id);
      res.json({ success: true, data: notification });
    } catch (error) {
      next(error);
    }
  };

  markAllRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const count = await this.service.markAllRead(req.user.id);
      res.json({ success: true, data: { count } });
    } catch (error) {
      next(error);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.service.remove(req.user.id, req.params.id);
      res.json({ success: true, data: { id: req.params.id } });
    } catch (error) {
      next(error);
    }
  };

  getSetting = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const setting = await this.service.getSetting(req.user.id);
      res.json({ success: true, data: setting });
    } catch (error) {
      next(error);
    }
  };

  updateSetting = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const setting = await this.service.updateSetting(
        req.user.id,
        req.body as UpdateNotificationSettingDto,
      );
      res.json({ success: true, data: setting });
    } catch (error) {
      next(error);
    }
  };
}
