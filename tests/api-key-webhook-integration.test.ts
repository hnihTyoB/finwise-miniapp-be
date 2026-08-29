import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/database/prisma.client';
import bcrypt from 'bcryptjs';
import { generateApiKey, generateWebhookSecret, encryptSecret } from '../src/common/helpers/crypto.helper';
import { ApiKeyStatus, WebhookStatus, WebhookDeliveryStatus } from '@prisma/client';

describe('API Key & Webhook Advanced Integration Tests', () => {
  const testUser = {
    email: `api-key-test-${Date.now()}@gmail.com`,
    password: 'Password@123456',
    fullName: 'API Key Integration User',
  };

  let userId: string;
  let accessToken: string;
  let walletId: string;
  let categoryId: string;
  let rawApiKey: string;
  let testApiKeyId: string;
  let testWebhookEndpointId: string;

  beforeAll(async () => {
    // 1. Create test user
    const defaultRole = await prisma.role.findFirst({ where: { name: 'USER' } });
    const passwordHash = await bcrypt.hash(testUser.password, 10);
    const user = await prisma.user.create({
      data: {
        email: testUser.email,
        password: passwordHash,
        fullName: testUser.fullName,
        roleId: defaultRole!.id,
        isActive: true,
      },
    });
    userId = user.id;

    // 2. Login to get JWT
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: testUser.email,
      password: testUser.password,
    });
    accessToken = loginRes.body.data.accessToken;

    // 3. Create wallet
    const wallet = await prisma.wallet.create({
      data: {
        userId,
        name: 'Integration Wallet',
        currency: 'VND',
        balance: 10000000,
      },
    });
    walletId = wallet.id;

    // 4. Create category
    const category = await prisma.category.create({
      data: {
        userId,
        name: 'Integration Expense',
        type: 'EXPENSE',
        icon: 'tag',
        color: '#FF0000',
      },
    });
    categoryId = category.id;

    // 5. Create API Key
    const keyData = generateApiKey();
    rawApiKey = keyData.rawKey;

    const createdKey = await prisma.apiKey.create({
      data: {
        userId,
        name: 'Automated Bot Key',
        keyPrefix: keyData.keyPrefix,
        keyHash: keyData.keyHash,
        permissions: ['TRANSACTION_CREATE', 'TRANSACTION_READ', 'WALLET_READ', 'REPORT_READ', 'CATEGORY_READ'],
        ipWhitelist: [],
        status: ApiKeyStatus.ACTIVE,
      },
    });
    testApiKeyId = createdKey.id;

    // 6. Create Webhook Endpoint
    const rawSecret = generateWebhookSecret();
    const webhook = await prisma.webhookEndpoint.create({
      data: {
        userId,
        url: 'https://httpbin.org/post',
        description: 'Test Webhook Receiver',
        secretEncrypted: encryptSecret(rawSecret),
        events: ['*'],
        status: WebhookStatus.ACTIVE,
      },
    });
    testWebhookEndpointId = webhook.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.apiKey.deleteMany({ where: { userId } });
    await prisma.webhookDelivery.deleteMany({ where: { webhookEndpointId: testWebhookEndpointId } });
    await prisma.webhookEndpoint.deleteMany({ where: { userId } });
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.category.deleteMany({ where: { userId } });
    await prisma.wallet.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  describe('1. Proposal 1: Core Financial APIs via API Key Authentication', () => {
    it('should list wallets using X-API-Key header', async () => {
      const res = await request(app)
        .get('/api/v1/wallets')
        .set('X-API-Key', rawApiKey);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should create a transaction using X-API-Key header and update wallet balance', async () => {
      const res = await request(app)
        .post('/api/v1/transactions')
        .set('X-API-Key', rawApiKey)
        .send({
          walletId,
          categoryId,
          amount: '150000',
          type: 'EXPENSE',
          date: '2026-08-23',
          description: 'API Key Automated Expense',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.amount).toBe('150000.00');
    });

    it('should fetch financial reports overview using X-API-Key header', async () => {
      const res = await request(app)
        .get('/api/v1/reports/overview?period=CUSTOM&dateFrom=2026-08-01T00:00:00.000Z&dateTo=2026-08-31T23:59:59.999Z')
        .set('X-API-Key', rawApiKey);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('2. Proposal 2: Real-time Webhook Dispatch', () => {
    it('should have dispatched a transaction.created webhook delivery on transaction creation', async () => {
      const deliveries = await prisma.webhookDelivery.findMany({
        where: {
          webhookEndpointId: testWebhookEndpointId,
          event: 'transaction.created',
        },
      });

      expect(deliveries.length).toBeGreaterThan(0);
      expect(deliveries[0].event).toBe('transaction.created');
    });
  });

  describe('3. Proposal 3: Webhook Manual Re-delivery / Retry', () => {
    it('should retry an existing webhook delivery via API', async () => {
      const testDelivery = await prisma.webhookDelivery.create({
        data: {
          webhookEndpointId: testWebhookEndpointId,
          eventId: 'evt_test_retry_123',
          event: 'ping',
          payload: { test: true },
          status: WebhookDeliveryStatus.FAILED,
          errorMessage: 'Connection timeout',
        },
      });

      const retryRes = await request(app)
        .post(`/api/v1/webhooks/${testWebhookEndpointId}/deliveries/${testDelivery.id}/retry`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(retryRes.status).toBe(200);
      expect(retryRes.body.success).toBe(true);
      expect(retryRes.body.message).toContain('re-enqueued');
    });
  });

  describe('4. Proposal 4 & 5: API Key Rate Limiting & IP Whitelisting', () => {
    it('should attach X-RateLimit headers on API Key calls', async () => {
      const res = await request(app)
        .get('/api/v1/categories')
        .set('X-API-Key', rawApiKey);

      expect(res.status).toBe(200);
      expect(res.headers).toHaveProperty('x-ratelimit-limit');
      expect(res.headers).toHaveProperty('x-ratelimit-remaining');
    });
  });
});
