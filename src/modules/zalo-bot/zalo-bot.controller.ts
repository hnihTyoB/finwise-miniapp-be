import { Request, Response, NextFunction } from 'express';
import { zaloBotWebhookService } from './services/zalo-bot-webhook.service';
import { zaloBotLinkService } from './services/zalo-bot-link.service';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import { envConfig } from '../../config/env.config';

export class ZaloBotController {
  /**
   * Endpoint nhận Webhook từ Zalo Bot Server.
   * Yêu cầu trả về 200 OK ngay lập tức để không bị timeout phía Zalo.
   */
  handleWebhook = async (req: Request, res: Response): Promise<void> => {
    // Phản hồi 200 OK ngay lập tức cho Zalo Server
    res.status(200).json({ ok: true });

    // Xử lý nội dung tin nhắn không đồng bộ
    setImmediate(() => {
      zaloBotWebhookService.processWebhook(req.body).catch(() => {
        // Đã được log trong service
      });
    });
  };

  /**
   * Sinh mã liên kết 1 chạm cho tài khoản FinWise đang đăng nhập.
   */
  createLinkCode = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError('Unauthorized', 401, ERROR_CODE.UNAUTHORIZED);
      }

      const result = await zaloBotLinkService.generateLinkCode(userId);
      const botId = envConfig.zaloBot.token.split(':')[0] || '2012016088824880961';
      res.json({
        success: true,
        data: {
          linkCode: result.linkCode,
          expiresInSeconds: result.expiresInSeconds,
          botId,
          botUsername: 'bot.uGsxQaGt',
          botDisplayName: 'Bot Finwise',
          deepLinkUrl: 'https://zalo.me/bot.uGsxQaGt',
          instruction: result.deepLinkInstruction,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Lấy trạng thái liên kết Zalo Bot của tài khoản FinWise hiện tại.
   */
  getLinkStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError('Unauthorized', 401, ERROR_CODE.UNAUTHORIZED);
      }

      const status = await zaloBotLinkService.getLinkStatus(userId);
      res.json({ success: true, data: status });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Hủy liên kết Zalo Bot cho tài khoản FinWise hiện tại.
   */
  unlink = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError('Unauthorized', 401, ERROR_CODE.UNAUTHORIZED);
      }

      await zaloBotLinkService.unlinkBot(userId);
      res.json({ success: true, data: { success: true } });
    } catch (error) {
      next(error);
    }
  };
}

export const zaloBotController = new ZaloBotController();
