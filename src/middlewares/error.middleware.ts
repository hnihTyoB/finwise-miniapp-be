import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../common/errors/app-error';
import { ERROR_CODE } from '../common/errors/error-code';

export function notFoundMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404, ERROR_CODE.NOT_FOUND));
}

export function errorMiddleware(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      code: error.code,
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(422).json({
      success: false,
      message: 'Validation failed',
      code: ERROR_CODE.VALIDATION_ERROR,
      errors: error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  console.error('[Unhandled Error]', error);

  res.status(500).json({
    success: false,
    message: 'Internal server error',
    code: 'INTERNAL_SERVER_ERROR',
  });
}
