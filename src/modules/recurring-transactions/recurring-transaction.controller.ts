import { NextFunction, Request, Response } from 'express';
import {
  CreateRecurringTransactionDto,
  RecurringTransactionHistoryQueryDto,
  RecurringTransactionPreviewQueryDto,
  RecurringTransactionQueryDto,
  UpdateRecurringTransactionDto,
} from './recurring-transaction.dto';
import { RecurringTransactionService } from './recurring-transaction.service';

export class RecurringTransactionController {
  private readonly service = new RecurringTransactionService();

  findAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.findAll(
        req.user.id,
        req.query as unknown as RecurringTransactionQueryDto,
      );
      res.json({ success: true, ...result });
    } catch (error) { next(error); }
  };

  findById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.findById(req.user.id, req.params.id);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.create(req.user.id, req.body as CreateRecurringTransactionDto);
      res.status(201).json({ success: true, data });
    } catch (error) { next(error); }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.update(
        req.user.id,
        req.params.id,
        req.body as UpdateRecurringTransactionDto,
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  };

  pause = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.pause(req.user.id, req.params.id);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  };

  resume = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.resume(req.user.id, req.params.id);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  };

  remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.remove(req.user.id, req.params.id);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  };

  preview = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.preview(
        req.user.id,
        req.params.id,
        req.query as unknown as RecurringTransactionPreviewQueryDto,
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  };

  history = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.history(
        req.user.id,
        req.params.id,
        req.query as unknown as RecurringTransactionHistoryQueryDto,
      );
      res.json({ success: true, ...result });
    } catch (error) { next(error); }
  };
}
