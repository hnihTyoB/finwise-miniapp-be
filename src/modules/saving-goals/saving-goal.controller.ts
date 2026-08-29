import { NextFunction, Request, Response } from 'express';
import {
  CreateSavingContributionDto,
  CreateSavingGoalDto,
  SavingContributionQueryDto,
  SavingGoalQueryDto,
  UpdateSavingContributionDto,
  UpdateSavingGoalDto,
} from './saving-goal.dto';
import { SavingGoalService } from './saving-goal.service';

export class SavingGoalController {
  private readonly service = new SavingGoalService();

  findAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.findAll(
        req.user.id,
        req.query as unknown as SavingGoalQueryDto,
      );

      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  findById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const goal = await this.service.findById(req.user.id, req.params.id);

      res.json({ success: true, data: goal });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const goal = await this.service.create(
        req.user.id,
        req.body as CreateSavingGoalDto,
      );

      res.status(201).json({ success: true, data: goal });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const goal = await this.service.update(
        req.user.id,
        req.params.id,
        req.body as UpdateSavingGoalDto,
      );

      res.json({ success: true, data: goal });
    } catch (error) {
      next(error);
    }
  };

  archive = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const goal = await this.service.archive(req.user.id, req.params.id);

      res.json({
        success: true,
        message: 'Saving goal archived successfully',
        data: goal,
      });
    } catch (error) {
      next(error);
    }
  };

  restore = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const goal = await this.service.restore(req.user.id, req.params.id);

      res.json({ success: true, data: goal });
    } catch (error) {
      next(error);
    }
  };

  findContributions = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await this.service.findContributions(
        req.user.id,
        req.params.id,
        req.query as unknown as SavingContributionQueryDto,
      );

      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  createContribution = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await this.service.createContribution(
        req.user.id,
        req.params.id,
        req.body as CreateSavingContributionDto,
      );

      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  updateContribution = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await this.service.updateContribution(
        req.user.id,
        req.params.id,
        req.params.contributionId,
        req.body as UpdateSavingContributionDto,
      );

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  deleteContribution = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await this.service.deleteContribution(
        req.user.id,
        req.params.id,
        req.params.contributionId,
      );

      res.json({
        success: true,
        message: 'Saving contribution deleted successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
