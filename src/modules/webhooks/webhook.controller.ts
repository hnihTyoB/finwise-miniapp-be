import { Request, Response, NextFunction } from 'express';
import { webhookService } from './webhook.service';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';

export class WebhookController {
  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Unauthorized', 401, ERROR_CODE.UNAUTHORIZED);
      }

      const result = await webhookService.createEndpoint(req.user.id, req.body);
      res.status(201).json({
        success: true,
        data: result,
        message: 'Webhook endpoint registered successfully. Store the signing secret safely.',
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

      const data = await webhookService.getUserEndpoints(req.user.id);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Unauthorized', 401, ERROR_CODE.UNAUTHORIZED);
      }

      const data = await webhookService.updateEndpoint(req.user.id, req.params.id, req.body);
      res.status(200).json({
        success: true,
        data,
        message: 'Webhook endpoint updated successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Unauthorized', 401, ERROR_CODE.UNAUTHORIZED);
      }

      await webhookService.deleteEndpoint(req.user.id, req.params.id);
      res.status(200).json({
        success: true,
        message: 'Webhook endpoint deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  getDeliveries = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Unauthorized', 401, ERROR_CODE.UNAUTHORIZED);
      }

      const data = await webhookService.getEndpointDeliveries(req.user.id, req.params.id);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  };

  testPing = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Unauthorized', 401, ERROR_CODE.UNAUTHORIZED);
      }

      const result = await webhookService.testPing(req.user.id, req.params.id);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  retryDelivery = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Unauthorized', 401, ERROR_CODE.UNAUTHORIZED);
      }

      const result = await webhookService.retryDelivery(
        req.user.id,
        req.params.id,
        req.params.deliveryId,
      );
      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const webhookController = new WebhookController();
