import { prisma } from '../src/database/prisma.client';
import bcrypt from 'bcryptjs';
import { savingsReminderService } from '../src/modules/savings/services/savings-reminder.service';
import {
  addBusinessDays,
  businessDateToPrismaDate,
  instantToBusinessDate,
} from '../src/common/date-time/business-time';

describe('Savings Reminder & Auto-Rollover Worker Integration Tests', () => {
  const testUser = {
    email: 'savings-reminder-test@gmail.com',
    password: 'Password@123456',
    fullName: 'Savings Reminder User',
  };

  let userId = '';
  let walletId = '';
  let t3DepositId = '';
  let t0DepositId = '';

  beforeAll(async () => {
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

    const wallet = await prisma.wallet.create({
      data: {
        userId,
        name: 'Ví Tiết Kiệm T-3 Test',
        balance: 50_000_000,
        currency: 'VND',
        type: 'SAVINGS_ACCOUNT',
      },
    });
    walletId = wallet.id;

    // Create a deposit with maturity exactly today + 3 business days
    const todayStr = instantToBusinessDate(new Date());
    const t3Str = addBusinessDays(todayStr, 3);

    const t3Deposit = await prisma.termDeposit.create({
      data: {
        userId,
        walletId,
        bankName: 'MBBank',
        principalAmount: 50_000_000,
        interestRate: 6.0,
        termMonths: 6,
        startDate: businessDateToPrismaDate('2026-01-01'),
        maturityDate: businessDateToPrismaDate(t3Str),
        rolloverMethod: 'ROLLOVER_ALL',
        estimatedInterest: 1_500_000,
        status: 'ACTIVE',
      },
    });
    t3DepositId = t3Deposit.id;

    // Create a deposit with maturity today
    const walletT0 = await prisma.wallet.create({
      data: {
        userId,
        name: 'Ví Tiết Kiệm T-0 Test',
        balance: 20_000_000,
        currency: 'VND',
        type: 'SAVINGS_ACCOUNT',
      },
    });

    const t0Deposit = await prisma.termDeposit.create({
      data: {
        userId,
        walletId: walletT0.id,
        bankName: 'Techcombank',
        principalAmount: 20_000_000,
        interestRate: 5.0,
        termMonths: 3,
        startDate: businessDateToPrismaDate('2026-01-01'),
        maturityDate: businessDateToPrismaDate(todayStr),
        rolloverMethod: 'ROLLOVER_ALL',
        estimatedInterest: 250_000,
        status: 'ACTIVE',
      },
    });
    t0DepositId = t0Deposit.id;
  });

  afterAll(async () => {
    await prisma.termDepositRolloverLog.deleteMany({
      where: { termDeposit: { userId } },
    });
    await prisma.notification.deleteMany({ where: { userId } });
    await prisma.termDeposit.deleteMany({ where: { userId } });
    await prisma.wallet.deleteMany({ where: { userId } });
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.userDevice.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it('1. processDueReminders - should detect T-3 deposit and create due soon notification', async () => {
    const result = await savingsReminderService.processDueReminders(new Date());
    expect(result.t3Count).toBeGreaterThanOrEqual(1);

    // Verify deposit flag updated
    const updated = await prisma.termDeposit.findUnique({ where: { id: t3DepositId } });
    expect(updated!.isReminderSentT3).toBe(true);

    // Verify notification was created
    const notification = await prisma.notification.findFirst({
      where: {
        userId,
        type: 'SAVINGS_DEPOSIT_DUE_SOON',
        sourceId: t3DepositId,
      },
    });
    expect(notification).not.toBeNull();
    expect(notification!.title).toContain('sắp đáo hạn (Còn 3 ngày)');
    expect(notification!.message).toContain('MBBank');
  });

  it('2. processDueReminders - second execution should be strictly idempotent (0 duplicate)', async () => {
    const secondResult = await savingsReminderService.processDueReminders(new Date());
    expect(secondResult.t3Count).toBe(0);

    const count = await prisma.notification.count({
      where: {
        userId,
        type: 'SAVINGS_DEPOSIT_DUE_SOON',
        sourceId: t3DepositId,
      },
    });
    expect(count).toBe(1);
  });

  it('3. processDueRollovers - should auto-rollover principal + interest on T-0 maturity date', async () => {
    const result = await savingsReminderService.processDueRollovers(new Date());
    expect(result.rolloverCount).toBeGreaterThanOrEqual(1);

    // Verify T0 deposit updated to cycle 1, principal += 250,000 = 20,250,000
    const rolledOver = await prisma.termDeposit.findUnique({
      where: { id: t0DepositId },
      include: { wallet: true },
    });
    expect(rolledOver!.rolloverCount).toBe(1);
    expect(Number(rolledOver!.principalAmount)).toBe(20_250_000);
    expect(Number(rolledOver!.wallet.balance)).toBe(20_250_000);

    // Verify maturity notification created
    const maturityNotif = await prisma.notification.findFirst({
      where: {
        userId,
        type: 'SAVINGS_DEPOSIT_MATURED',
        sourceId: t0DepositId,
      },
    });
    expect(maturityNotif).not.toBeNull();
    expect(maturityNotif!.title).toContain('tái tục gốc + lãi');
  });
});
