import { Request, Response, NextFunction } from 'express';
import { aiRateLimitMiddleware } from './ai-rate-limit.middleware';
import { adminAiRepository } from '../modules/ai-assistant/admin-ai.repository';
import { cacheService } from '../common/services/cache.service';
import { systemSettingService } from '../modules/system-settings/system-setting.service';

describe('aiRateLimitMiddleware (SEC-W0-01 & SEC-W0-02 Verification)', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.Mock;
  let headers: Record<string, string>;

  beforeEach(() => {
    headers = {};
    req = {
      ip: `192.168.1.${Math.floor(Math.random() * 100000)}`,
      socket: { remoteAddress: '127.0.0.1' } as any,
      user: { id: `user-ai-test-${Date.now()}-${Math.random()}` } as any,
    };
    res = {
      setHeader: jest.fn((name: string, value: string) => {
        headers[name] = value;
        return res as Response;
      }),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();

    jest.spyOn(systemSettingService, 'getNumber').mockImplementation((key: string, defaultValue?: number) => {
      if (key === 'ai.rate_limit.max_requests') return Promise.resolve(3);
      if (key === 'ai.rate_limit.window_ms') return Promise.resolve(60000);
      return Promise.resolve(defaultValue ?? 0);
    });

    jest.spyOn(adminAiRepository, 'createLog').mockResolvedValue({} as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('SEC-W0-02: Database Write Amplification Protection', () => {
    it('should log rate limit violation only ONCE when crossing threshold, preventing DB write amplification on repeated 429 requests', async () => {
      // Limit is configured to 3 requests per window in mock
      // 1st, 2nd, 3rd requests should pass
      for (let i = 0; i < 3; i++) {
        await aiRateLimitMiddleware(req as Request, res as Response, next);
      }
      expect(next).toHaveBeenCalledTimes(3);
      expect(adminAiRepository.createLog).not.toHaveBeenCalled();

      // 4th request (1st violation): threshold breached -> 429 and logs once
      await aiRateLimitMiddleware(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(adminAiRepository.createLog).toHaveBeenCalledTimes(1);

      // 5th, 6th, 7th requests (subsequent violations): still 429, but MUST NOT write to DB again!
      for (let i = 0; i < 3; i++) {
        await aiRateLimitMiddleware(req as Request, res as Response, next);
      }
      expect(res.status).toHaveBeenCalledWith(429);
      // createLog call count MUST STILL BE 1 (not 4)
      expect(adminAiRepository.createLog).toHaveBeenCalledTimes(1);
    });
  });

  describe('SEC-W0-01: Redis Pipeline & TTL Self-Healing', () => {
    it('should recover and set TTL if key was missing TTL (ttl < 0)', async () => {
      const mockPexpire = jest.fn().mockResolvedValue(1);
      const mockExec = jest.fn().mockResolvedValue([
        [null, 5],  // currentCount = 5
        [null, -1], // ttlMs = -1 (TTL missing due to previous crash)
      ]);
      const mockPipeline = {
        incr: jest.fn().mockReturnThis(),
        pttl: jest.fn().mockReturnThis(),
        exec: mockExec,
      };

      const mockRedisClient = {
        pipeline: jest.fn().mockReturnValue(mockPipeline),
        pexpire: mockPexpire,
      };

      jest.spyOn(cacheService, 'isUsingRedis').mockReturnValue(true);
      jest.spyOn(cacheService, 'getRedisClient').mockReturnValue(mockRedisClient as any);

      await aiRateLimitMiddleware(req as Request, res as Response, next);

      expect(mockPipeline.incr).toHaveBeenCalled();
      expect(mockPipeline.pttl).toHaveBeenCalled();
      // Since ttlMs was -1, pexpire MUST have been called to heal the missing TTL!
      expect(mockPexpire).toHaveBeenCalledWith(expect.stringContaining('finwise:ai-rate-limit:'), 60000);
      expect(res.status).toHaveBeenCalledWith(429);
    });
  });
});
