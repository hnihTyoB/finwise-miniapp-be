import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { AppError } from '../common/errors/app-error';
import { ERROR_CODE } from '../common/errors/error-code';

type ValidateTarget = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, target: ValidateTarget = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const input = target === 'query'
      ? req.query
      : target === 'params'
        ? req.params
        : req.body;
    const result = schema.safeParse(input);

    if (!result.success) {
      next(result.error);
      return;
    }

    switch (target) {
      case 'query':
        req.query = result.data;
        break;
      case 'params':
        req.params = result.data;
        break;
      default:
        req.body = result.data;
    }

    next();
  };
}
