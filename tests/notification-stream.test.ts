import http from 'http';
import request from 'supertest';
import app from '../src/app';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../src/config/jwt.config';
import { notificationStreamService } from '../src/modules/notifications/notification-stream.service';
import { prisma } from '../src/database/prisma.client';
import { SYSTEM_ROLES } from '../src/common/constants';

describe('Notification SSE Stream Integration Tests', () => {
  let userToken: string;
  let userId: string;

  beforeAll(async () => {
    const userRole = await prisma.role.findUnique({
      where: { name: SYSTEM_ROLES.USER },
    });

    const user = await prisma.user.create({
      data: {
        email: `sse-test-${Date.now()}@finwise.local`,
        password: 'hashedpassword',
        fullName: 'SSE Test User',
        isActive: true,
        roleId: userRole!.id,
      },
    });
    userId = user.id;

    userToken = jwt.sign(
      { id: user.id, email: user.email, role: SYSTEM_ROLES.USER },
      jwtConfig.accessSecret,
      { expiresIn: '1h' },
    );
  });

  afterAll(async () => {
    notificationStreamService.shutdown();
    if (userId) {
      await prisma.notification.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  });

  it('should reject unauthorized connection with 401', async () => {
    const res = await request(app).get('/api/v1/notifications/stream');
    expect(res.status).toBe(401);
  });

  it('should accept connection with query token and establish text/event-stream headers', (done) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const addr = server.address() as any;
      const port = addr.port;
      const clientReq = http.get(
        `http://127.0.0.1:${port}/api/v1/notifications/stream?token=${encodeURIComponent(userToken)}`,
        (res) => {
          expect(res.statusCode).toBe(200);
          expect(res.headers['content-type']).toContain('text/event-stream');
          expect(res.headers['cache-control']).toContain('no-cache');

          let receivedData = '';
          res.on('data', (chunk) => {
            receivedData += chunk.toString();
            if (receivedData.includes('event: connected') && receivedData.includes('event: unread_count')) {
              expect(receivedData).toContain('event: connected');
              expect(receivedData).toContain('event: unread_count');
              clientReq.destroy();
              server.close(() => done());
            }
          });
        },
      );

      clientReq.on('error', (err: any) => {
        if (err.code === 'ECONNRESET' || clientReq.destroyed) {
          return;
        }
        server.close(() => done(err));
      });
    });
  });

  it('should broadcast notification and unread count to active connections', async () => {
    let mockChunk = '';
    const mockRes: any = {
      writableEnded: false,
      destroyed: false,
      write: jest.fn((chunk: string) => {
        mockChunk += chunk;
        return true;
      }),
      on: jest.fn(),
      end: jest.fn(),
    };
    const mockReq: any = {
      on: jest.fn(),
    };

    await notificationStreamService.registerClient(userId, mockRes, mockReq);
    expect(notificationStreamService.getActiveConnectionCount(userId)).toBeGreaterThanOrEqual(1);

    // Broadcast test event
    notificationStreamService.broadcastToUser(userId, 'unread_count', { count: 5 });
    expect(mockChunk).toContain('event: unread_count');
    expect(mockChunk).toContain('"count":5');

    // Simulate disconnect
    const closeHandler = mockReq.on.mock.calls.find((c: any) => c[0] === 'close')?.[1];
    if (closeHandler) {
      closeHandler();
    }
  });
});
