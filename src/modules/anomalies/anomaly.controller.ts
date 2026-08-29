import { NextFunction, Request, Response } from 'express';
import { evaluateAnomalySchema } from './anomaly.validation';
import { AnomalyService } from './anomaly.service';

export class AnomalyController {
  private readonly service = new AnomalyService();

  evaluate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = evaluateAnomalySchema.parse(req.body);
      const data = await this.service.evaluateTransaction(req.user.id, input);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  getRecent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getRecentAnomalies(req.user.id);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };
}
