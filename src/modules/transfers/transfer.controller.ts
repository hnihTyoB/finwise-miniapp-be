import { NextFunction, Request, Response } from 'express';
import { CreateTransferDto, TransferQueryDto } from './transfer.dto';
import { TransferService } from './transfer.service';

export class TransferController {
  private readonly service = new TransferService();

  findAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.findAll(
        req.user.id,
        req.query as unknown as TransferQueryDto,
      );

      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const transfer = await this.service.create(
        req.user.id,
        req.body as CreateTransferDto,
      );

      res.status(201).json({ success: true, data: transfer });
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const transfer = await this.service.delete(req.user.id, req.params.id);

      res.json({
        success: true,
        message: 'Transfer deleted successfully',
        data: transfer,
      });
    } catch (error) {
      next(error);
    }
  };
}
