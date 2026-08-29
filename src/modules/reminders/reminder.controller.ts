import { NextFunction, Request, Response } from 'express';
import {
  CreateReminderDto,
  ReminderQueryDto,
  UpdateReminderDto,
} from './reminder.dto';
import { ReminderService } from './reminder.service';

export class ReminderController {
  private readonly service = new ReminderService();

  findAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.findAll(
        req.user.id,
        req.query as unknown as ReminderQueryDto,
      );
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  findById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reminder = await this.service.findById(req.user.id, req.params.id);
      res.json({ success: true, data: reminder });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reminder = await this.service.create(
        req.user.id,
        req.body as CreateReminderDto,
      );
      res.status(201).json({ success: true, data: reminder });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reminder = await this.service.update(
        req.user.id,
        req.params.id,
        req.body as UpdateReminderDto,
      );
      res.json({ success: true, data: reminder });
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
}
