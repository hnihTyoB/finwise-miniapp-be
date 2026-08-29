import { ErrorCode } from './error-code';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code?: ErrorCode;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500, code?: ErrorCode) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Object.setPrototypeOf(this, new.target.prototype);

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

