import { NextFunction, Request, Response } from 'express';
import {
  budgetDepletionQuerySchema,
  forecastQuerySchema,
} from './forecast.validation';
import { ForecastService } from './forecast.service';

export class ForecastController {
  private readonly service = new ForecastService();

  getRunway = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = forecastQuerySchema.parse(req.query);
      const data = await this.service.getRunway(req.user.id, query);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  getBudgetDepletion = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = budgetDepletionQuerySchema.parse(req.query);
      const data = await this.service.getBudgetDepletion(req.user.id, query);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };
}
