import { NextFunction, Request, Response } from 'express';
import {
  BudgetQueryDto,
  CreateBudgetDto,
  UpdateBudgetDto,
} from './budget.dto';
import { BudgetService } from './budget.service';

export class BudgetController {
  private readonly service = new BudgetService();

  findAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.findAll(
        req.user.id,
        req.query as unknown as BudgetQueryDto,
      );

      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  findById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const budget = await this.service.findById(req.user.id, req.params.id);

      res.json({ success: true, data: budget });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const budget = await this.service.create(
        req.user.id,
        req.body as CreateBudgetDto,
      );

      res.status(201).json({ success: true, data: budget });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const budget = await this.service.update(
        req.user.id,
        req.params.id,
        req.body as UpdateBudgetDto,
      );

      res.json({ success: true, data: budget });
    } catch (error) {
      next(error);
    }
  };

  archive = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const budget = await this.service.archive(req.user.id, req.params.id);

      res.json({
        success: true,
        message: 'Budget archived successfully',
        data: budget,
      });
    } catch (error) {
      next(error);
    }
  };

  toggleAutoRenew = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const budget = await this.service.toggleAutoRenew(
        req.user.id,
        req.params.id,
        req.body.autoRenew,
      );

      res.json({ success: true, data: budget });
    } catch (error) {
      next(error);
    }
  };

  findSeries = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const series = await this.service.findSeries(req.user.id, req.params.id);

      res.json({ success: true, data: series });
    } catch (error) {
      next(error);
    }
  };

  restore = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const budget = await this.service.restore(req.user.id, req.params.id);

      res.json({ success: true, data: budget });
    } catch (error) {
      next(error);
    }
  };
}
