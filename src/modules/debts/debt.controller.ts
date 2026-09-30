import { NextFunction, Request, Response } from 'express';
import {
  CreateDebtContractDto,
  DebtContractQueryDto,
  EarlySettlementDto,
  PayInstallmentDto,
  PreviewAmortizationScheduleDto,
  UpdateDebtContractDto,
} from './debt.dto';
import { DebtService } from './debt.service';
import { DebtSettlementService } from './services/debt-settlement.service';

export class DebtController {
  private readonly service = new DebtService();
  private readonly settlementService = new DebtSettlementService();

  preview = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = this.service.previewAmortization(
        req.body as PreviewAmortizationScheduleDto,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  findAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.findAll(
        req.user.id,
        req.query as unknown as DebtContractQueryDto,
      );
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  findById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.findById(req.params.id, req.user.id);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.create(
        req.user.id,
        req.body as CreateDebtContractDto,
      );
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.update(
        req.params.id,
        req.user.id,
        req.body as UpdateDebtContractDto,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  archive = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.archive(req.params.id, req.user.id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  payInstallment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const period = Number(req.params.period);
      const result = await this.settlementService.payInstallment(
        req.user.id,
        req.params.id,
        period,
        req.body as PayInstallmentDto,
      );
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  settleEarly = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.settlementService.settleEarly(
        req.user.id,
        req.params.id,
        req.body as EarlySettlementDto,
      );
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };
}

