import { NextFunction, Request, Response } from 'express';
import { ReportQueryDto } from './report.dto';
import { ReportService } from './report.service';

export class ReportController {
  private readonly service = new ReportService();

  overview = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getOverview(
        req.user.id,
        req.query as unknown as ReportQueryDto,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  cashFlow = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getCashFlow(
        req.user.id,
        req.query as unknown as ReportQueryDto,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  spendingByCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getSpendingByCategory(
        req.user.id,
        req.query as unknown as ReportQueryDto,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  budgetPerformance = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getBudgetPerformance(
        req.user.id,
        req.query as unknown as ReportQueryDto,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };
}
