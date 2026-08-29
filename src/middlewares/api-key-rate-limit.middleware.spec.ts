import { Request, Response, NextFunction } from 'express';
import { apiKeyRateLimitMiddleware } from './api-key-rate-limit.middleware';

describe('apiKeyRateLimitMiddleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.Mock;
  let headers: Record<string, string>;

  beforeEach(() => {
    headers = {};
    req = {
      user: {
        id: 'user-123',
        email: 'user@example.com',
        role: 'USER' as any,
        permissions: ['TRANSACTION_CREATE'],
        apiKeyId: 'key-test-rate-limit',
      },
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
    jest.clearAllMocks();
  });

  it('should skip rate limiting if request is not authenticated via API Key', async () => {
    req.user = {
      id: 'user-123',
      email: 'user@example.com',
      role: 'USER' as any,
      permissions: ['TRANSACTION_CREATE'],
    };

    await apiKeyRateLimitMiddleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it('should attach X-RateLimit headers and call next on valid request', async () => {
    await apiKeyRateLimitMiddleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', expect.any(String));
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(String));
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
  });

  it('should return 429 when max requests are exceeded within window', async () => {
    const customKeyId = `key-excess-${Date.now()}`;
    req.user!.apiKeyId = customKeyId;

    // Simulate sending 125 requests (limit is 120)
    for (let i = 0; i < 120; i++) {
      await apiKeyRateLimitMiddleware(req as Request, res as Response, next);
    }
    expect(next).toHaveBeenCalledTimes(120);

    // 121st request should be blocked
    await apiKeyRateLimitMiddleware(req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'RATE_LIMIT_EXCEEDED',
      }),
    );
  });
});
