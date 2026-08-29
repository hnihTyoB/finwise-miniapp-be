import { Request, Response, NextFunction } from 'express';
import { jobService } from './job.service';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';

export class JobController {
  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Unauthorized', 401, ERROR_CODE.UNAUTHORIZED);
      }

      const result = await jobService.createJob(req.user.id, req.body);
      res.status(202).json({
        success: true,
        data: result,
        message: 'Async job created and queued for processing. Callbacks will be dispatched to configured webhooks upon completion.',
      });
    } catch (error) {
      next(error);
    }
  };

  findById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Unauthorized', 401, ERROR_CODE.UNAUTHORIZED);
      }

      const data = await jobService.getJob(req.user.id, req.params.id);
      res.status(200).json({
        success: true,
        data,
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

      const data = await jobService.listJobs(req.user.id);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const jobController = new JobController();
