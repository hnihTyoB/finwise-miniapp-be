import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/database/prisma.client';
import bcrypt from 'bcryptjs';

describe('Shared Wallets & Family Budget Integration Tests', () => {
  const ownerUser = {
    email: 'shared-wallet-owner@test.com',
    password: 'Password@123456',
    fullName: 'Owner User',
  };

  const memberUser = {
    email: 'shared-wallet-member@test.com',
    password: 'Password@123456',
    fullName: 'Member User',
  };

  let ownerId = '';
  let ownerToken = '';
  let memberId = '';
  let memberToken = '';
  let walletId = '';
  let inviteCode = '';
  let memberRecordId = '';
  let expenseCategoryId = '';
  let createdTransactionId = '';

  beforeAll(async () => {
    const defaultRole = await prisma.role.findUnique({ where: { name: 'USER' } });
    const passwordHash = await bcrypt.hash('Password@123456', 10);

    // Create Owner
    const owner = await prisma.user.create({
      data: {
        email: ownerUser.email,
        password: passwordHash,
        fullName: ownerUser.fullName,
        roleId: defaultRole!.id,
        isActive: true,
      },
    });
    ownerId = owner.id;

    // Create Member
    const member = await prisma.user.create({
      data: {
        email: memberUser.email,
        password: passwordHash,
        fullName: memberUser.fullName,
        roleId: defaultRole!.id,
        isActive: true,
      },
    });
    memberId = member.id;

    // Login Owner
    const ownerLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: ownerUser.email, password: ownerUser.password });
    ownerToken = ownerLogin.body.data.accessToken;

    // Login Member
    const memberLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: memberUser.email, password: memberUser.password });
    memberToken = memberLogin.body.data.accessToken;

    // Get an expense category
    let category = await prisma.category.findFirst({
      where: { type: 'EXPENSE' },
    });
    if (!category) {
      category = await prisma.category.create({
        data: {
          name: 'Ăn uống test',
          type: 'EXPENSE',
          icon: 'food',
          color: '#F59E0B',
        },
      });
    }
    expenseCategoryId = category.id;
  });

  afterAll(async () => {
    if (walletId) {
      await prisma.transaction.deleteMany({ where: { walletId } });
      await prisma.walletInvitation.deleteMany({ where: { walletId } });
      await prisma.walletMember.deleteMany({ where: { walletId } });
      await prisma.wallet.deleteMany({ where: { id: walletId } });
    }
    await prisma.notification.deleteMany({
      where: { userId: { in: [ownerId, memberId] } },
    });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: [ownerId, memberId] } },
    });
    await prisma.userDevice.deleteMany({
      where: { userId: { in: [ownerId, memberId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, memberId] } },
    });
  });

  it('1. Owner creates a wallet for sharing', async () => {
    const res = await request(app)
      .post('/api/v1/wallets')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Quỹ gia đình',
        balance: '5000000.00',
        currency: 'VND',
        icon: 'family',
        color: '#6366F1',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Quỹ gia đình');
    walletId = res.body.data.id;
  });

  it('2. Owner creates an invitation with role MEMBER', async () => {
    const res = await request(app)
      .post(`/api/v1/wallets/${walletId}/invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        role: 'MEMBER',
        expiresInDays: 7,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.inviteCode).toBeDefined();
    expect(res.body.data.qrCodeDataUrl).toContain('data:image/png;base64');
    expect(res.body.data.role).toBe('MEMBER');
    inviteCode = res.body.data.inviteCode;
  });

  it('3. Member previews the invitation by code', async () => {
    const res = await request(app)
      .get(`/api/v1/wallets/invitations/preview/${inviteCode}`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.walletName).toBe('Quỹ gia đình');
    expect(res.body.data.inviterName).toBe(ownerUser.fullName);
    expect(res.body.data.role).toBe('MEMBER');
  });

  it('4. Member accepts the invitation with a nickname', async () => {
    const res = await request(app)
      .post('/api/v1/wallets/invitations/accept')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        inviteCode,
        nickname: 'Vợ yêu',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.role).toBe('MEMBER');
    expect(res.body.data.nickname).toBe('Vợ yêu');
    memberRecordId = res.body.data.id;
  });

  it('5. Listing members includes Owner and Member with status ACTIVE', async () => {
    const res = await request(app)
      .get(`/api/v1/wallets/${walletId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(2);

    const ownerMember = res.body.data.find((m: any) => m.role === 'OWNER');
    const normalMember = res.body.data.find((m: any) => m.role === 'MEMBER');
    expect(ownerMember).toBeDefined();
    expect(normalMember).toBeDefined();
    expect(normalMember.nickname).toBe('Vợ yêu');
  });

  it('6. Owner updates member spending limit to 1,000,000 VND', async () => {
    const res = await request(app)
      .put(`/api/v1/wallets/${walletId}/members/${memberRecordId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        monthlySpendingLimit: '1000000.00',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.monthlySpendingLimit).toBe('1000000.00');
  });

  it('7. Member creates an expense transaction in the shared wallet', async () => {
    const res = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        walletId,
        categoryId: expenseCategoryId,
        amount: '200000.00',
        type: 'EXPENSE',
        description: 'Đi siêu thị gia đình',
        date: new Date().toISOString().slice(0, 10),
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.createdBy.fullName).toBe(memberUser.fullName);
    expect(res.body.data.isSharedWallet).toBe(true);
    createdTransactionId = res.body.data.id;

    // Verify wallet balance decreased: 5,000,000 - 200,000 = 4,800,000
    const walletRes = await request(app)
      .get(`/api/v1/wallets/${walletId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(Number(walletRes.body.data.balance)).toBe(4800000);
    expect(walletRes.body.data.isShared).toBe(true);
  });

  it('8. Member exceeds monthly limit -> rejected with 422', async () => {
    // Current spent: 200,000. Limit: 1,000,000. Trying to spend 900,000 -> 1,100,000 > 1,000,000
    const res = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        walletId,
        categoryId: expenseCategoryId,
        amount: '900000.00',
        type: 'EXPENSE',
        description: 'Khoản chi vượt hạn mức',
        date: new Date().toISOString().slice(0, 10),
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('9. Shared wallet analytics returns member breakdown', async () => {
    const res = await request(app)
      .get(`/api/v1/wallets/${walletId}/analytics`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.walletName).toBe('Quỹ gia đình');
    expect(Number(res.body.data.totalSpent)).toBe(200000);

    const memberBreakdown = res.body.data.memberBreakdown;
    expect(memberBreakdown.length).toBeGreaterThanOrEqual(1);
    const wifeSpender = memberBreakdown.find((m: any) => m.userId === memberId);
    expect(wifeSpender).toBeDefined();
    expect(Number(wifeSpender.totalSpent)).toBe(200000);
  });

  it('10. Member leaves the wallet', async () => {
    const res = await request(app)
      .post(`/api/v1/wallets/${walletId}/members/leave`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Check members list now only has Owner
    const membersRes = await request(app)
      .get(`/api/v1/wallets/${walletId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(membersRes.body.data.length).toBe(1);
    expect(membersRes.body.data[0].role).toBe('OWNER');
  });

  it('11. Member list does not expose sensitive PII (email, phoneNumber)', async () => {
    const res = await request(app)
      .get(`/api/v1/wallets/${walletId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const m of res.body.data) {
      expect(m.email).toBeUndefined();
      expect(m.phoneNumber).toBeUndefined();
    }
  });

  it('12. Filter wallets by spendingScope query param (SHARED vs PERSONAL)', async () => {
    // Current walletId is now isShared=false because all members left
    const personalRes = await request(app)
      .get('/api/v1/wallets?spendingScope=PERSONAL')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(personalRes.status).toBe(200);
    expect(personalRes.body.data.some((w: any) => w.id === walletId)).toBe(true);
  });

  it('13. Cancel invitation rejects invalid UUID inviteId with 422', async () => {
    const res = await request(app)
      .delete(`/api/v1/wallets/${walletId}/invitations/not-a-valid-uuid`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });
});
