import { Request, Response, NextFunction } from 'express';
import { zaloWebhookAuthMiddleware } from './zalo-webhook-auth.middleware';
import { envConfig } from '../config/env.config';

describe('zaloWebhookAuthMiddleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;
  const originalSecret = envConfig.zaloBot.secretToken;

  beforeAll(() => {
    (envConfig.zaloBot as any).secretToken = 'test_secret_token_12345678';
  });

  afterAll(() => {
    (envConfig.zaloBot as any).secretToken = originalSecret;
  });

  beforeEach(() => {
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    req = { headers: {} };
    res = { status: statusMock };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('should call next() when X-Bot-Api-Secret-Token matches configured secret', () => {
    req.headers = {
      'x-bot-api-secret-token': 'test_secret_token_12345678',
    };

    zaloWebhookAuthMiddleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(statusMock).not.toHaveBeenCalled();
  });

  it('should return 403 when X-Bot-Api-Secret-Token header is missing', () => {
    req.headers = {};

    zaloWebhookAuthMiddleware(req as Request, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusMock).toHaveBeenCalledWith(403);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });

  it('should return 403 when X-Bot-Api-Secret-Token does not match', () => {
    req.headers = {
      'x-bot-api-secret-token': 'wrong_secret_token_87654321',
    };

    zaloWebhookAuthMiddleware(req as Request, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusMock).toHaveBeenCalledWith(403);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });
});
