import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { envConfig } from '../config/env.config';
import { LoggerService } from '../common/services/logger.service';

const logger = new LoggerService('ZaloWebhookAuth');

/**
 * Middleware xác thực yêu cầu Webhook từ Zalo Bot Platform.
 * Zalo Bot gửi kèm header X-Bot-Api-Secret-Token với giá trị secret_token đã thiết lập qua API setWebhook.
 * Tham khảo: https://bot.zapps.me/docs/webhook/
 */
export function zaloWebhookAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const configuredSecret = envConfig.zaloBot.secretToken;

  if (!configuredSecret) {
    logger.warn('Zalo Bot secretToken is not configured in env.');
    res.status(500).json({ ok: false, message: 'Zalo Bot Webhook secret is not configured' });
    return;
  }

  const incomingHeader = req.headers['x-bot-api-secret-token'];
  const incomingToken = Array.isArray(incomingHeader) ? incomingHeader[0] : incomingHeader;

  if (!incomingToken) {
    logger.warn('Missing X-Bot-Api-Secret-Token header from Zalo Webhook request');
    res.status(403).json({ ok: false, message: 'Missing secret token header' });
    return;
  }

  const expectedBuffer = Buffer.from(configuredSecret, 'utf-8');
  const incomingBuffer = Buffer.from(incomingToken, 'utf-8');

  if (expectedBuffer.length !== incomingBuffer.length || !crypto.timingSafeEqual(expectedBuffer, incomingBuffer)) {
    logger.warn('Invalid X-Bot-Api-Secret-Token provided in Zalo Webhook request');
    res.status(403).json({ ok: false, message: 'Invalid secret token' });
    return;
  }

  next();
}
