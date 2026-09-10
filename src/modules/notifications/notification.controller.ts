import { NextFunction, Request, Response } from 'express';
import {
  NotificationQueryDto,
  UpdateNotificationSettingDto,
} from './notification.dto';
import { NotificationService } from './notification.service';
import { notificationStreamService } from './notification-stream.service';

export class NotificationController {
  private readonly service = new NotificationService();

  stream = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }
      await notificationStreamService.registerClient(req.user.id, res, req);
    } catch (error) {
      next(error);
    }
  };

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
