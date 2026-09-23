import { Request, Response, NextFunction } from 'express';
import { statementService } from './statement.service';
import { CreateStatementExportInput, StatementHistoryQuery } from './statement.validation';

export class StatementController {
  initiateExport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const body = req.body as CreateStatementExportInput;
      const result = await statementService.initiateExport(userId, {
        walletId: body.walletId,
        dateFrom: body.dateFrom,
        dateTo: body.dateTo,
        format: body.format,
        password: body.password,
        passwordHint: body.passwordHint,
      });
      res.status(202).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  getJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const result = await statementService.getJob(userId, id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  downloadStatement = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const proxy = req.query.proxy === 'true' || req.headers['x-download-mode'] === 'stream';
      // When inline=true (used by Zalo openDocument), serve as inline so Zalo can preview it
      const inline = req.query.inline === 'true';
      const result = await statementService.downloadStatement(userId, id, proxy);
      if (result.type === 'redirect') {
        res.redirect(result.url);
        return;
      }
      if (result.type === 'stream') {
        res.setHeader('Content-Type', result.mimeType);
        const isPdf = result.fileName.toLowerCase().endsWith('.pdf');
        const disposition = inline && isPdf
          ? `inline; filename="${result.fileName}"`
          : `attachment; filename="${result.fileName}"`;
        res.setHeader('Content-Disposition', disposition);
        if (result.contentLength) {
          res.setHeader('Content-Length', result.contentLength.toString());
        }
        result.stream.pipe(res);
        return;
      }
      if (result.type === 'file') {
        res.setHeader('Content-Type', result.mimeType);
        res.download(result.filePath, result.fileName);
        return;
      }
      res.status(404).json({ success: false, message: 'File not found' });
    } catch (err) {
      next(err);
    }
  };

  listHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const query = req.query as unknown as StatementHistoryQuery;
      const result = await statementService.listJobs(userId, query.page, query.limit);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  };

  verifyStatement = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { code } = req.params;
      const result = await statementService.verifyStatement(code);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };
}
