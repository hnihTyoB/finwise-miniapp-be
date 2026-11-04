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
    const firstMessage = error.errors[0]?.message;
    res.status(422).json({
      success: false,
      message: firstMessage ? `Validation failed: ${firstMessage}` : 'Validation failed',
      code: ERROR_CODE.VALIDATION_ERROR,
      errors: error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Handle BodyParser entity.too.large / 413 Payload Too Large
  const anyError = error as { type?: string; status?: number; statusCode?: number };
  if (anyError.type === 'entity.too.large' || anyError.status === 413 || anyError.statusCode === 413) {
    res.status(413).json({
      success: false,
      message: 'Payload too large',
      code: 'PAYLOAD_TOO_LARGE',
    });
    return;
  }

  // Handle BodyParser entity.parse.failed / 400 Bad Request (Malformed JSON syntax)
  if (
    anyError.type === 'entity.parse.failed' ||
    (error instanceof SyntaxError && 'body' in error && (anyError.status === 400 || anyError.statusCode === 400))
  ) {
    res.status(400).json({
      success: false,
      message: 'Invalid JSON payload format',
      code: ERROR_CODE.VALIDATION_ERROR,
    });
    return;
  }

  // Handle URIError / 400 Bad Request (Malformed URI encoding in URL)
  if (error instanceof URIError) {
    res.status(400).json({
      success: false,
      message: 'Malformed URI encoding in request URL',
      code: ERROR_CODE.VALIDATION_ERROR,
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
