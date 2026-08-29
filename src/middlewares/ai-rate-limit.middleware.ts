import { NextFunction, Request, Response } from 'express';
import { AiRequestStatus } from '@prisma/client';
import { ERROR_CODE } from '../common/errors/error-code';
import { envConfig } from '../config/env.config';
import { cacheService } from '../common/services/cache.service';
import { systemSettingService } from '../modules/system-settings/system-setting.service';
import { adminAiRepository } from '../modules/ai-assistant/admin-ai.repository';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const requestCounts = new Map<string, RateLimitRecord>();
let lastCleanupAt = 0;

export async function aiRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const key = req.user?.id || req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  const [maxRequests, windowMs] = await Promise.all([
    systemSettingService.getNumber('ai.rate_limit.max_requests', envConfig.ai.rateLimit.maxRequests),
    systemSettingService.getNumber('ai.rate_limit.window_ms', envConfig.ai.rateLimit.windowMs),
  ]);

  const isUsingRedis = cacheService.isUsingRedis();
  const redisClient = cacheService.getRedisClient();

  if (isUsingRedis && redisClient) {
    try {
      const redisKey = `finwise:ai-rate-limit:${key}`;
      const currentCount = await redisClient.incr(redisKey);

      if (currentCount === 1) {
        await redisClient.pexpire(redisKey, windowMs);
      }

      if (currentCount > maxRequests) {
        const ttlMs = await redisClient.pttl(redisKey);
        const retryAfterSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
        res.setHeader('Retry-After', retryAfterSeconds.toString());

        await adminAiRepository.createLog({
          userId: req.user?.id,
          feature: 'RATE_LIMIT',
          provider: 'system',
          model: 'rate-limiter',
          status: AiRequestStatus.RATE_LIMITED,
          latencyMs: 0,
          errorMessage: `AI request rate limit exceeded (${currentCount}/${maxRequests} in ${Math.round(windowMs / 1000)}s)`,
        }).catch(() => {});

        res.status(429).json({
          success: false,
          message: 'AI request limit exceeded, please try again later',
          code: ERROR_CODE.AI_RATE_LIMIT_EXCEEDED,
        });
        return;
      }

      next();
      return;
    } catch (error) {
      console.error('Redis AI rate limiting failed. Falling back to memory rate limiting.', error);
    }
  }

  if (now - lastCleanupAt >= windowMs) {
    requestCounts.forEach((value, recordKey) => {
      if (now >= value.resetAt) {
        requestCounts.delete(recordKey);
      }
    });
    lastCleanupAt = now;
  }
  const record = requestCounts.get(key);

  if (!record || now >= record.resetAt) {
    requestCounts.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    next();
    return;
  }

  record.count += 1;
  if (record.count <= maxRequests) {
    next();
    return;
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
  res.setHeader('Retry-After', retryAfterSeconds.toString());

  // Log rate limit event
  await adminAiRepository.createLog({
    userId: req.user?.id,
    feature: 'RATE_LIMIT',
    provider: 'system',
    model: 'rate-limiter',
    status: AiRequestStatus.RATE_LIMITED,
    latencyMs: 0,
    errorMessage: `AI request rate limit exceeded (${record.count}/${maxRequests} in ${Math.round(windowMs / 1000)}s)`,
  }).catch(() => {});

  res.status(429).json({
    success: false,
    message: 'AI request limit exceeded, please try again later',
    code: ERROR_CODE.AI_RATE_LIMIT_EXCEEDED,
  });
}

