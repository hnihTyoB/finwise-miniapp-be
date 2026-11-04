import { Request, Response, NextFunction } from 'express';
import { envConfig } from '../config/env.config';
import { cacheService } from '../common/services/cache.service';
import { ERROR_CODE } from '../common/errors/error-code';
import { MAX_RATE_LIMIT_ENTRIES, pruneRateLimitMap } from './rate-limit.middleware';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const keyCounts = new Map<string, RateLimitRecord>();
let lastCleanupAt = 0;

export async function apiKeyRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const apiKeyId = req.user?.apiKeyId;

  // Only apply to requests authenticated via API Key
  if (!apiKeyId) {
    next();
    return;
  }

  const now = Date.now();
  const maxRequests = envConfig.apiKeyRateLimit.maxRequests;
  const windowMs = envConfig.apiKeyRateLimit.windowMs;

  const isUsingRedis = cacheService.isUsingRedis();
  const redisClient = cacheService.getRedisClient();

  if (isUsingRedis && redisClient) {
    try {
      const redisKey = `finwise:api-key-rate-limit:${apiKeyId}`;
      const results = await redisClient
        .pipeline()
        .incr(redisKey)
        .pttl(redisKey)
        .exec();

      if (!results || results[0][0] || results[1][0]) {
        throw new Error('Redis pipeline API key rate limit failed');
      }

      const currentCount = results[0][1] as number;
      let ttlMs = results[1][1] as number;

      // SEC-W0-01: Ensure TTL is always set on first request or recovered if key lacks TTL
      if (currentCount === 1 || ttlMs < 0) {
        await redisClient.pexpire(redisKey, windowMs);
        ttlMs = windowMs;
      }

      const remaining = Math.max(0, maxRequests - currentCount);
      const resetTimeSeconds = Math.ceil((now + ttlMs) / 1000);

      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', remaining.toString());
      res.setHeader('X-RateLimit-Reset', resetTimeSeconds.toString());

      if (currentCount > maxRequests) {
        const retryAfterSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
        res.setHeader('Retry-After', retryAfterSeconds.toString());
        res.status(429).json({
          success: false,
          message: 'API Key rate limit exceeded. Please throttle your requests.',
          code: ERROR_CODE.RATE_LIMIT_EXCEEDED,
        });
        return;
      }

      next();
      return;
    } catch (error) {
      console.error('Redis API key rate limiting failed. Falling back to memory.', error);
    }
  }

  // SEC-W0-06: Memory-safe sliding window rate limit fallback with strict cardinality bound
  if (now - lastCleanupAt >= windowMs || keyCounts.size >= MAX_RATE_LIMIT_ENTRIES) {
    pruneRateLimitMap(keyCounts, now);
    lastCleanupAt = now;
  }

  let record = keyCounts.get(apiKeyId);

  if (!record || now >= record.resetAt) {
    record = {
      count: 1,
      resetAt: now + windowMs,
    };
    keyCounts.set(apiKeyId, record);

    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', (maxRequests - 1).toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetAt / 1000).toString());

    next();
    return;
  }

  record.count += 1;
  const remaining = Math.max(0, maxRequests - record.count);
  res.setHeader('X-RateLimit-Limit', maxRequests.toString());
  res.setHeader('X-RateLimit-Remaining', remaining.toString());
  res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetAt / 1000).toString());

  if (record.count > maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    res.setHeader('Retry-After', retryAfterSeconds.toString());
    res.status(429).json({
      success: false,
      message: 'API Key rate limit exceeded. Please throttle your requests.',
      code: ERROR_CODE.RATE_LIMIT_EXCEEDED,
    });
    return;
  }

  next();
}
