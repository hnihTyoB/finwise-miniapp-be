import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/database/prisma.client';
import bcrypt from 'bcryptjs';

describe('Wallet Integration Tests', () => {
  const testUser = {
    email: 'wallet-test@gmail.com',
    password: 'Password@123456',
    fullName: 'Wallet Test User',
  };

  let userId = '';
  let accessToken = '';
  let walletId = '';

  beforeAll(async () => {
    // Setup test user
    const defaultRole = await prisma.role.findUnique({ where: { name: 'USER' } });
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

    // Login to get token
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: testUser.password });

    accessToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.transfer.deleteMany({ where: { userId } });
    await prisma.wallet.deleteMany({ where: { userId } });
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.userDevice.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it('should create a new wallet with initial balance', async () => {
    const res = await request(app)
      .post('/api/v1/wallets')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Ví tiền mặt',
        balance: '500000.00',
        currency: 'VND',
        icon: 'cash',
        color: '#10B981',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Ví tiền mặt');
    expect(res.body.data.balance).toBe('500000.00');
    expect(res.body.data.isDefault).toBe(true);
    walletId = res.body.data.id;
  });

  it('should update wallet name and balance via update', async () => {
    const res = await request(app)
      .put(`/api/v1/wallets/${walletId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Ví tiền mặt mới',
        balance: '750000.00',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Ví tiền mặt mới');
    expect(res.body.data.balance).toBe('750000.00');

    // Verify directly in DB
    const dbWallet = await prisma.wallet.findUnique({ where: { id: walletId } });
    expect(dbWallet?.balance.toFixed(2)).toBe('750000.00');
  });
});
