import { prisma } from '../src/database/prisma.client';
import { zaloBotCommandDispatcher } from '../src/modules/zalo-bot/services/zalo-bot-command.dispatcher';
import { ZaloBotService, zaloBotService } from '../src/common/services/zalo-bot.service';
import { debtReminderService } from '../src/modules/debts/services/debt-reminder.service';
import { addBusinessDays, instantToBusinessDate, businessDateToPrismaDate } from '../src/common/date-time/business-time';
import bcrypt from 'bcryptjs';

describe('Zalo Bot Debt Commands & Reminder Pipeline', () => {
  const testUser = {
    email: 'zalo-debt-test@gmail.com',
    password: 'Password@123456',
    fullName: 'Zalo Debt Tester',
  };

  const testChatId = 'zalo-chat-debt-999';
  let userId = '';
  let walletId = '';
  let debtId = '';
  let installmentId = '';
  let sendMessageSpy: jest.SpyInstance;

  beforeAll(async () => {
    // 1. Create User
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

    // 2. Link Zalo chat ID
    await prisma.notificationSetting.create({
      data: {
        userId,
        zaloBotChatId: testChatId,
      },
    });

    // 3. Create wallet with 50M
    const wallet = await prisma.wallet.create({
      data: {
        userId,
        name: 'Ví MB Bank',
        balance: 50_000_000,
        currency: 'VND',
      },
    });
    walletId = wallet.id;

    // 4. Create active debt contract
    const contract = await prisma.debtContract.create({
      data: {
        userId,
        walletId,
        name: 'Vay tín chấp tiêu dùng',
        counterparty: 'MB Bank',
        type: 'DEBT_PAYABLE',
        method: 'REDUCING_BALANCE',
        status: 'ACTIVE',
        principal: 20_000_000,
        remainingPrincipal: 20_000_000,
        annualInterestRate: 12,
        termMonths: 2,
        startDate: new Date('2026-10-01'),
      },
    });
    debtId = contract.id;

    // 5. Create 2 installments: Kỳ 1 (dueDate = hôm nay + 3 ngày: T-3), Kỳ 2 (dueDate = tháng sau)
    const todayBusiness = instantToBusinessDate(new Date());
    const t3Business = addBusinessDays(todayBusiness, 3);

    const item1 = await prisma.debtScheduleItem.create({
      data: {
        debtContractId: debtId,
        userId,
        period: 1,
        dueDate: businessDateToPrismaDate(t3Business),
        principalDue: 10_000_000,
        interestDue: 200_000,
        totalDue: 10_200_000,
        remainingPrincipal: 10_000_000,
        status: 'SCHEDULED',
      },
    });
    installmentId = item1.id;

    await prisma.debtScheduleItem.create({
      data: {
        debtContractId: debtId,
        userId,
        period: 2,
        dueDate: businessDateToPrismaDate(addBusinessDays(todayBusiness, 33)),
        principalDue: 10_000_000,
        interestDue: 100_000,
        totalDue: 10_100_000,
        remainingPrincipal: 0,
        status: 'SCHEDULED',
      },
    });
  });

  afterAll(async () => {
    sendMessageSpy.mockRestore();
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.debtScheduleItem.deleteMany({ where: { userId } });
    await prisma.debtContract.deleteMany({ where: { userId } });
    await prisma.category.deleteMany({ where: { userId } });
    await prisma.wallet.deleteMany({ where: { userId } });
    await prisma.notification.deleteMany({ where: { userId } });
    await prisma.notificationSetting.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  beforeEach(() => {
    sendMessageSpy = jest.spyOn(ZaloBotService.prototype, 'sendMessage').mockResolvedValue({ messageId: 'mock-msg-999' });
  });

  describe('Zalo Bot Command: /no (Query Debts)', () => {
    it('should reply with active debts summary and upcoming installments', async () => {
      await zaloBotCommandDispatcher.dispatch({
        chatId: testChatId,
        senderName: 'Zalo Tester',
        text: '/no',
      });

      expect(sendMessageSpy).toHaveBeenCalledTimes(1);
      const [chatId, text] = sendMessageSpy.mock.calls[0];
      expect(chatId).toBe(testChatId);
      expect(text).toContain('TỔNG QUAN NỢ & CHO VAY');
      expect(text).toContain('20.000.000 đ');
      expect(text).toContain('Vay tín chấp tiêu dùng');
      expect(text).toContain(`/tra_no ${installmentId}`);
    });
  });

  describe('Zalo Bot Command: /tra_no <id> (1-Tap Pay)', () => {
    it('should atomically pay installment and reply with payment receipt', async () => {
      await zaloBotCommandDispatcher.dispatch({
        chatId: testChatId,
        senderName: 'Zalo Tester',
        text: `/tra_no ${installmentId}`,
      });

      expect(sendMessageSpy).toHaveBeenCalledTimes(1);
      const [chatId, text] = sendMessageSpy.mock.calls[0];
      expect(chatId).toBe(testChatId);
      expect(text).toContain('THANH TOÁN KỲ NỢ THÀNH CÔNG');
      expect(text).toContain('10.200.000 đ');
      expect(text).toContain('10.000.000 đ');
      expect(text).toContain('Dư nợ gốc còn lại');

      // Verify DB state
      const updatedItem = await prisma.debtScheduleItem.findUnique({ where: { id: installmentId } });
      expect(updatedItem?.status).toBe('PAID');
      expect(Number(updatedItem?.principalPaid)).toBe(10_000_000);

      const updatedContract = await prisma.debtContract.findUnique({ where: { id: debtId } });
      expect(Number(updatedContract?.remainingPrincipal)).toBe(10_000_000);

      // Verify wallet decremented: 50M - 10.2M = 39.8M
      const updatedWallet = await prisma.wallet.findUnique({ where: { id: walletId } });
      expect(Number(updatedWallet?.balance)).toBe(39_800_000);
    });

    it('should notify user if installment was already paid', async () => {
      await zaloBotCommandDispatcher.dispatch({
        chatId: testChatId,
        senderName: 'Zalo Tester',
        text: `/tra_no ${installmentId}`,
      });

      expect(sendMessageSpy).toHaveBeenCalledTimes(1);
      const [, text] = sendMessageSpy.mock.calls[0];
      expect(text).toContain('đã được thanh toán trước đó');
    });
  });

  describe('DebtReminderService (Scheduled T-3, T-0 & Overdue Scan)', () => {
    it('should scan and detect T-3 debt items and create notification', async () => {
      // Create a new debt installment exactly due at today + 3 days
      const todayBusiness = instantToBusinessDate(new Date());
      const t3Business = addBusinessDays(todayBusiness, 3);

      const reminderItem = await prisma.debtScheduleItem.create({
        data: {
          debtContractId: debtId,
          userId,
          period: 99,
          dueDate: businessDateToPrismaDate(t3Business),
          principalDue: 5_000_000,
          interestDue: 50_000,
          totalDue: 5_050_000,
          remainingPrincipal: 5_000_000,
          status: 'SCHEDULED',
        },
      });

      const result = await debtReminderService.processDueReminders(new Date());
      expect(result.t3Count).toBeGreaterThanOrEqual(1);

      // Verify notification in DB
      const notif = await prisma.notification.findFirst({
        where: {
          userId,
          dedupKey: `DEBT_T3_${reminderItem.id}_${t3Business}`,
        },
      });
      expect(notif).not.toBeNull();
      expect(notif?.title).toContain('Nhắc hạn trả nợ');
      expect(notif?.actionUrl).toBe(`/debts/${debtId}`);

      // Verify item transitioned to UPCOMING
      const itemAfter = await prisma.debtScheduleItem.findUnique({ where: { id: reminderItem.id } });
      expect(itemAfter?.status).toBe('UPCOMING');
    });

    it('should scan and detect T-3 loan receivable items and phrase notification for lender', async () => {
      const todayBusiness = instantToBusinessDate(new Date());
      const t3Business = addBusinessDays(todayBusiness, 3);

      const loanContract = await prisma.debtContract.create({
        data: {
          userId,
          walletId,
          name: 'Cho bạn mượn tiền',
          counterparty: 'Nguyễn Văn B',
          type: 'LOAN_RECEIVABLE',
          method: 'FIXED_ANNUITY',
          status: 'ACTIVE',
          principal: 5_000_000,
          remainingPrincipal: 5_000_000,
          annualInterestRate: 0,
          termMonths: 1,
          startDate: new Date(),
        },
      });

      const loanItem = await prisma.debtScheduleItem.create({
        data: {
          debtContractId: loanContract.id,
          userId,
          period: 1,
          dueDate: businessDateToPrismaDate(t3Business),
          principalDue: 5_000_000,
          interestDue: 0,
          totalDue: 5_000_000,
          remainingPrincipal: 0,
          status: 'SCHEDULED',
        },
      });

      const result = await debtReminderService.processDueReminders(new Date());
      expect(result.t3Count).toBeGreaterThanOrEqual(1);

      const notif = await prisma.notification.findFirst({
        where: {
          userId,
          dedupKey: `DEBT_T3_${loanItem.id}_${t3Business}`,
        },
      });
      expect(notif).not.toBeNull();
      expect(notif?.title).toContain('Nhắc hạn thu nợ');
      expect(notif?.message).toContain('khoản cho vay');
      expect(notif?.actionUrl).toBe(`/debts/${loanContract.id}`);

      // Clean up loan test data
      await prisma.debtScheduleItem.delete({ where: { id: loanItem.id } });
      await prisma.debtContract.delete({ where: { id: loanContract.id } });
    });
  });
});
