import { NextFunction, Request, Response } from 'express';
import { convertSubscriptionToReminderSchema } from './subscription.validation';
import { ConvertSubscriptionToRecurringTransactionDto } from '../recurring-transactions/recurring-transaction.dto';
import { SubscriptionService } from './subscription.service';

export class SubscriptionController {
  private readonly service = new SubscriptionService();

  discover = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.discoverSubscriptions(req.user.id);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  convertToReminder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = convertSubscriptionToReminderSchema.parse(req.body);
      const data = await this.service.convertToReminder(req.user.id, input);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  convertToRecurringTransaction = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.convertToRecurringTransaction(
        req.user.id,
        req.body as ConvertSubscriptionToRecurringTransactionDto,
      );
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };
}
