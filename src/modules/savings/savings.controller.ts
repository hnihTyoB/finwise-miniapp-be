import { NextFunction, Request, Response } from 'express';
import {
  CreateTermDepositDto,
  SettleTermDepositDto,
  TermDepositQueryDto,
  UpdateTermDepositDto,
} from './savings.dto';
import { SavingsService } from './savings.service';

export class SavingsController {
  private readonly service = new SavingsService();

  findAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as TermDepositQueryDto;
      const result = await this.service.findAll(req.user!.id, query);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  findById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.findById(req.user!.id, req.params.id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CreateTermDepositDto;
      const result = await this.service.create(req.user!.id, body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as UpdateTermDepositDto;
      const result = await this.service.update(req.user!.id, req.params.id, body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  settle = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as SettleTermDepositDto;
      const result = await this.service.settle(req.user!.id, req.params.id, body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  preview = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body;
      const result = this.service.preview(
        body.principalAmount,
        body.interestRate,
        body.termMonths,
        body.startDate,
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  previewEarlyWithdrawal = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const date = typeof req.query.date === 'string' ? req.query.date : undefined;
      const result = await this.service.previewEarlyWithdrawal(req.user!.id, req.params.id, date);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}
