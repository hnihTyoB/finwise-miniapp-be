import { readFile } from 'fs/promises';
import { NextFunction, Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import {
  CreateTransactionDto,
  TransactionQueryDto,
  UpdateTransactionDto,
} from './transaction.dto';
import { TransactionService } from './transaction.service';

export class TransactionController {
  private readonly service = new TransactionService();

  findAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.findAll(
        req.user.id,
        req.query as unknown as TransactionQueryDto,
      );

      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  findById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const transaction = await this.service.findById(req.user.id, req.params.id);

      res.json({ success: true, data: transaction });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const transaction = await this.service.create(
        req.user.id,
        req.body as CreateTransactionDto,
      );

      res.status(201).json({ success: true, data: transaction });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const transaction = await this.service.update(
        req.user.id,
        req.params.id,
        req.body as UpdateTransactionDto,
      );

      res.json({ success: true, data: transaction });
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deleted = await this.service.delete(req.user.id, req.params.id);

      res.json({
        success: true,
        message: 'Transaction deleted successfully',
        data: deleted,
      });
    } catch (error) {
      next(error);
    }
  };

  uploadReceipt = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new AppError(
          'Receipt file is required in the "receipt" field',
          422,
          ERROR_CODE.VALIDATION_ERROR,
        );
      }

      const transaction = await this.service.uploadReceipt(
        req.user.id,
        req.params.id,
        req.file,
      );

      res.json({ success: true, data: transaction });
    } catch (error) {
      next(error);
    }
  };

  getReceipt = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const receipt = await this.service.getReceipt(req.user.id, req.params.id);
      const content = receipt.buffer
        ?? await readFile(receipt.absolutePath!);

      res.set({
        'Content-Type': receipt.mimeType,
        'Content-Disposition': `inline; filename="receipt${receipt.extension}"`,
        'Content-Length': content.length.toString(),
        'Cache-Control': 'private, max-age=3600',
      });
      res.send(content);
    } catch (error) {
      next(error);
    }
  };

  deleteReceipt = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const transaction = await this.service.deleteReceipt(
        req.user.id,
        req.params.id,
      );

      res.json({
        success: true,
        message: 'Receipt deleted successfully',
        data: transaction,
      });
    } catch (error) {
      next(error);
    }
  };
}
