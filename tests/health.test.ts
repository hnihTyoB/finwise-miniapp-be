import request from 'supertest';
import app from '../src/app';
import { getPrismaClient } from '../src/database/prisma.client';

describe('GET /api/v1/health (Public Minimal)', () => {
  it('should return 200 and status ok if database is up (without leaking internals)', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).not.toHaveProperty('memory');
    expect(res.body).not.toHaveProperty('database');
  });

  it('should return 503 and status error if database is down', async () => {
    const client = getPrismaClient();
    const originalQueryRaw = client.$queryRaw;
    client.$queryRaw = jest.fn().mockRejectedValueOnce(new Error('Connection failed'));

    try {
      const res = await request(app).get('/api/v1/health');

      expect(res.status).toBe(503);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('status', 'error');
    } finally {
      client.$queryRaw = originalQueryRaw;
    }
  });
});
