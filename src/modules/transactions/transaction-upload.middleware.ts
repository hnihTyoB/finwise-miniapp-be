import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import { envConfig } from '../../config/env.config';

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: envConfig.receipts.maxFileSizeBytes,
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      callback(
        new AppError(
          'Receipt must be a JPEG, PNG, WebP, or PDF file',
          422,
          ERROR_CODE.FILE_TYPE_UNSUPPORTED,
        ),
      );
      return;
    }

    callback(null, true);
  },
}).single('receipt');

export function receiptUploadMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  upload(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        next(
          new AppError(
            `Receipt must not exceed ${envConfig.receipts.maxFileSizeMb} MB`,
            413,
            ERROR_CODE.FILE_TOO_LARGE,
          ),
        );
        return;
      }

      next(new AppError(error.message, 422, ERROR_CODE.VALIDATION_ERROR));
      return;
    }

    if (error) {
      next(error);
      return;
    }

    if (!req.file) {
      next(
        new AppError(
          'Receipt file is required in the "receipt" field',
          422,
          ERROR_CODE.VALIDATION_ERROR,
        ),
      );
      return;
    }

    next();
  });
}

