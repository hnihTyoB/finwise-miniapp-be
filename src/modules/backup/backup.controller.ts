import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import { backupService } from './backup.service';
import { exportBackupSchema, importBackupSchema } from './backup.validation';

export class BackupController {
  /**
   * Tải xuống hoặc lấy nội dung file JSON sao lưu
   */
  async exportBackup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;

      // SEC-W3-06: Forbid passing sensitive password in URL query parameters (CWE-598)
      if (req.query.password) {
        throw new AppError(
          'Không được truyền mật khẩu bảo vệ bản sao lưu qua URL query parameter. Vui lòng sử dụng POST với body JSON để đảm bảo an toàn thông tin.',
          400,
          ERROR_CODE.VALIDATION_ERROR,
        );
      }

      const password = req.body?.password as string | undefined;

      if (password) {
        exportBackupSchema.parse({ password });
      }

      const file = await backupService.exportBackup(userId, { password });

      const filename = `finwise-backup-${new Date().toISOString().slice(0, 10)}.json`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/json');

      res.status(200).json({
        success: true,
        data: file,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Phân tích và xem trước dữ liệu file sao lưu (Step 2 Preview)
   */
  async previewBackup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      let fileContent: Buffer | string | undefined;

      if (req.file) {
        fileContent = req.file.buffer;
      } else if (req.body.fileContent) {
        fileContent = req.body.fileContent;
      } else if (req.body.data || req.body.ciphertext) {
        // Body chính là nội dung file JSON
        fileContent = JSON.stringify(req.body);
      }

      if (!fileContent) {
        throw new AppError(
          'Vui lòng tải lên file sao lưu JSON (trường "file") hoặc truyền "fileContent".',
          422,
          ERROR_CODE.VALIDATION_ERROR,
        );
      }

      const password = (req.body.password as string) || (req.query.password as string);

      const preview = await backupService.previewBackup(userId, fileContent, password);

      res.status(200).json({
        success: true,
        data: preview,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Thực hiện nạp và hợp nhất dữ liệu (Step 4 Execute)
   */
  async importBackup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      let fileContent: Buffer | string | undefined;
      let rawOptions: any = req.body;

      if (req.file) {
        fileContent = req.file.buffer;
        if (typeof req.body.options === 'string') {
          try {
            rawOptions = JSON.parse(req.body.options);
          } catch {
            rawOptions = {};
          }
        }
      } else if (req.body.fileContent) {
        fileContent = req.body.fileContent;
      } else if (req.body.file) {
        fileContent = typeof req.body.file === 'string' ? req.body.file : JSON.stringify(req.body.file);
      }

      if (!fileContent) {
        throw new AppError(
          'Vui lòng tải lên file sao lưu JSON (trường "file") hoặc truyền "fileContent".',
          422,
          ERROR_CODE.VALIDATION_ERROR,
        );
      }

      const validatedOptions = importBackupSchema.parse({
        walletResolutions: rawOptions.walletResolutions || [],
        balanceMode: rawOptions.balanceMode || 'ACCUMULATE',
        password: rawOptions.password || req.body.password,
      });

      const result = await backupService.importBackup(userId, fileContent, validatedOptions, {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        fileName: req.file?.originalname,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const backupController = new BackupController();
