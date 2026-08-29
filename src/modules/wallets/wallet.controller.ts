import { NextFunction, Request, Response } from 'express';
import { CreateWalletDto, UpdateWalletDto, WalletQueryDto } from './wallet.dto';
import { WalletService } from './wallet.service';

export class WalletController {
  private readonly service = new WalletService();

  findAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as WalletQueryDto;
      const result = await this.service.findAll(req.user.id, query);

      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  findById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const wallet = await this.service.findById(req.user.id, req.params.id);

      res.json({ success: true, data: wallet });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const wallet = await this.service.create(req.user.id, req.body as CreateWalletDto);

      res.status(201).json({ success: true, data: wallet });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const wallet = await this.service.update(
        req.user.id,
        req.params.id,
        req.body as UpdateWalletDto,
      );

      res.json({ success: true, data: wallet });
    } catch (error) {
      next(error);
    }
  };

  setDefault = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const wallet = await this.service.setDefault(req.user.id, req.params.id);

      res.json({ success: true, data: wallet });
    } catch (error) {
      next(error);
    }
  };

  archive = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const wallet = await this.service.archive(req.user.id, req.params.id);

      res.json({
        success: true,
        message: 'Wallet archived successfully',
        data: wallet,
      });
    } catch (error) {
      next(error);
    }
  };

  restore = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const wallet = await this.service.restore(req.user.id, req.params.id);

      res.json({ success: true, data: wallet });
    } catch (error) {
      next(error);
    }
  };
}
