import { Request, Response, NextFunction } from 'express';
import { ApiKeyService } from './api-key.service';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';

export class ApiKeyController {
  private readonly service = new ApiKeyService();

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Unauthorized', 401, ERROR_CODE.UNAUTHORIZED);
      }

      const result = await this.service.createApiKey(req.user.id, req.body);
      res.status(201).json({
        success: true,
        data: result,
        message: 'API Key created successfully. Store the raw key safely as it will not be shown again.',
      });
    } catch (error) {
      next(error);
    }
  };

  findAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Unauthorized', 401, ERROR_CODE.UNAUTHORIZED);
      }

      const data = await this.service.getUserApiKeys(req.user.id);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  };

  revoke = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Unauthorized', 401, ERROR_CODE.UNAUTHORIZED);
      }

      await this.service.revokeApiKey(req.user.id, req.params.id);
      res.status(200).json({
        success: true,
        message: 'API Key revoked successfully',
      });
    } catch (error) {
      next(error);
    }
  };
}
