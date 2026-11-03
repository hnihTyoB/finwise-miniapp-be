import { Prisma, WalletMemberRole, WalletType } from '@prisma/client';
import { TransactionService } from '../src/modules/transactions/transaction.service';
import { TransactionRepository } from '../src/modules/transactions/transaction.repository';
import { SharedWalletService } from '../src/modules/wallets/shared-wallet.service';
import { WalletService } from '../src/modules/wallets/wallet.service';
import { TransferService } from '../src/modules/transfers/transfer.service';
import { prisma } from '../src/database/prisma.client';

describe('Wave 2 Security Fixes Verification Tests (SEC-W2-01, SEC-W2-02, SEC-W2-03)', () => {
  const transactionService = new TransactionService();
  const sharedWalletService = new SharedWalletService();
  const walletService = new WalletService();

  describe('SEC-W2-01: VIEWER Role Prevention from Deleting Transactions & Mutating Shared Wallet Balance', () => {
    it('should reject transaction deletion if caller is a VIEWER in the shared wallet', async () => {
      const viewerUserId = '01a0b566-b93e-7991-92d9-7103c9752201';
      const walletId = '01a0b566-b93e-7991-92d9-7103c9752202';
      const transactionId = '01a0b566-b93e-7991-92d9-7103c9752203';

      jest.spyOn((transactionService as any).repository, 'findById').mockResolvedValue({
        id: transactionId,
        userId: viewerUserId, // Viewer created it prior to demotion
        walletId,
        amount: new Prisma.Decimal(500000),
        type: 'EXPENSE',
      });

      jest.spyOn((transactionService as any).repository, 'findWallet').mockResolvedValue({
        id: walletId,
        userId: 'owner-uuid',
        isArchived: false,
      });

      // Mock findUserWalletRole returning VIEWER on transactionService's sharedWalletService
      jest.spyOn(((transactionService as any).sharedWalletService as any).repository, 'findUserWalletRole').mockResolvedValue(WalletMemberRole.VIEWER);

      await expect(
        transactionService.delete(viewerUserId, transactionId),
      ).rejects.toThrow('Tài khoản chỉ có quyền xem, không được phép xóa giao dịch trong ví này');
    });

    it('should allow transaction deletion if caller is the OWNER or an active MEMBER who created it', async () => {
      const memberUserId = '01a0b566-b93e-7991-92d9-7103c9752201';
      const walletId = '01a0b566-b93e-7991-92d9-7103c9752202';
      const transactionId = '01a0b566-b93e-7991-92d9-7103c9752203';

      jest.spyOn((transactionService as any).repository, 'findById').mockResolvedValue({
        id: transactionId,
        userId: memberUserId,
        walletId,
        amount: new Prisma.Decimal(200000),
        type: 'EXPENSE',
      });

      jest.spyOn((transactionService as any).repository, 'findWallet').mockResolvedValue({
        id: walletId,
        userId: 'owner-uuid',
        isArchived: false,
      });

      // Mock findUserWalletRole returning MEMBER on transactionService's sharedWalletService
      jest.spyOn(((transactionService as any).sharedWalletService as any).repository, 'findUserWalletRole').mockResolvedValue(WalletMemberRole.MEMBER);
      jest.spyOn((transactionService as any).repository, 'adjustWalletBalance').mockResolvedValue({ id: walletId });
      jest.spyOn((transactionService as any).repository, 'delete').mockResolvedValue({ id: transactionId, receiptUrl: null });
      jest.spyOn((transactionService as any).receiptFiles, 'remove').mockResolvedValue(undefined);
      jest.spyOn<any, any>(transactionService, 'invalidateReportCache').mockResolvedValue(undefined);

      const result = await transactionService.delete(memberUserId, transactionId);
      expect(result).toEqual({ id: transactionId });
    });
  });

  describe('SEC-W2-02: Atomic Spending Limit Enforcement & Race Condition / Future-Date Defense', () => {
    it('should reject assertCanCreateTransaction when member exceeds monthly spending limit', async () => {
      const memberUserId = 'member-user-uuid';
      const walletId = 'shared-wallet-uuid';

      jest.spyOn((sharedWalletService as any).repository, 'findUserWalletRole').mockResolvedValue(WalletMemberRole.MEMBER);
      jest.spyOn((sharedWalletService as any).repository, 'findMember').mockResolvedValue({
        id: 'member-record-id',
        monthlySpendingLimit: new Prisma.Decimal(1000000),
      });

      // Member already spent 800,000 VND
      jest.spyOn((sharedWalletService as any).repository, 'getMemberSpentInDateRange').mockResolvedValue(
        new Prisma.Decimal(800000),
      );

      // Attempting to spend 300,000 VND -> total 1,100,000 > 1,000,000
      await expect(
        sharedWalletService.assertCanCreateTransaction(
          memberUserId,
          walletId,
          new Prisma.Decimal(300000),
          'EXPENSE',
          '2026-11-25', // Future date within month
        ),
      ).rejects.toThrow('Khoản chi này vượt quá hạn mức chi tiêu tháng của bạn (1000000 đ)');
    });

    it('should correctly calculate startOfMonth to the last day of month rather than truncating at today', async () => {
      const memberUserId = 'member-user-uuid';
      const walletId = 'shared-wallet-uuid';

      jest.spyOn((sharedWalletService as any).repository, 'findUserWalletRole').mockResolvedValue(WalletMemberRole.MEMBER);
      jest.spyOn((sharedWalletService as any).repository, 'findMember').mockResolvedValue({
        id: 'member-record-id',
        monthlySpendingLimit: new Prisma.Decimal(2000000),
      });

      const getSpentSpy = jest
        .spyOn((sharedWalletService as any).repository, 'getMemberSpentInDateRange')
        .mockResolvedValue(new Prisma.Decimal(500000));

      await sharedWalletService.assertCanCreateTransaction(
        memberUserId,
        walletId,
        new Prisma.Decimal(200000),
        'EXPENSE',
        '2026-11-15',
      );

      // Verify that endOfMonth covers through the 30th of November 2026
      expect(getSpentSpy).toHaveBeenCalledWith(
        walletId,
        memberUserId,
        expect.any(Date),
        expect.any(Date),
        undefined,
      );

      const fromDate = getSpentSpy.mock.calls[0][2] as Date;
      const toDate = getSpentSpy.mock.calls[0][3] as Date;
      expect(toDate.getTime()).toBeGreaterThan(fromDate.getTime());
      // The day of toDate should be 30 for November
      expect(toDate.getUTCDate()).toBe(30);

      getSpentSpy.mockRestore();
    });

    it('should reject assertCanUpdateTransaction when increasing expense exceeds monthly limit', async () => {
      const memberUserId = 'member-user-uuid';
      const walletId = 'shared-wallet-uuid';

      jest.spyOn((sharedWalletService as any).repository, 'findUserWalletRole').mockResolvedValue(WalletMemberRole.MEMBER);
      jest.spyOn((sharedWalletService as any).repository, 'findMember').mockResolvedValue({
        id: 'member-record-id',
        monthlySpendingLimit: new Prisma.Decimal(1000000),
      });

      // Member already spent 900,000 VND
      jest.spyOn((sharedWalletService as any).repository, 'getMemberSpentInDateRange').mockResolvedValue(
        new Prisma.Decimal(900000),
      );

      // Editing transaction from 100,000 to 300,000 (net increase: +200,000) -> 900k + 200k = 1,100k > 1,000k
      await expect(
        sharedWalletService.assertCanUpdateTransaction(
          memberUserId,
          walletId,
          walletId,
          new Prisma.Decimal(100000),
          'EXPENSE',
          new Prisma.Decimal(300000),
          'EXPENSE',
          '2026-11-10',
        ),
      ).rejects.toThrow('Khoản chi sửa đổi này vượt quá hạn mức chi tiêu tháng của bạn');
    });
  });

  describe('SEC-W2-03: BOLA on Wallet Restore Authorization Defense', () => {
    it('should reject restore if caller is a MEMBER in the shared wallet', async () => {
      const memberUserId = 'member-user-uuid';
      const walletId = 'shared-wallet-uuid';

      jest.spyOn(walletService, 'findById').mockResolvedValue({
        id: walletId,
        userId: 'owner-user-uuid',
        myRole: 'MEMBER', // Caller is only MEMBER
        isArchived: true,
      } as any);

      await expect(walletService.restore(memberUserId, walletId)).rejects.toThrow(
        'Chỉ chủ ví mới có quyền phục hồi ví đã lưu trữ',
      );
    });

    it('should reject restore if caller is a VIEWER in the shared wallet', async () => {
      const viewerUserId = 'viewer-user-uuid';
      const walletId = 'shared-wallet-uuid';

      jest.spyOn(walletService, 'findById').mockResolvedValue({
        id: walletId,
        userId: 'owner-user-uuid',
        myRole: 'VIEWER', // Caller is only VIEWER
        isArchived: true,
      } as any);

      await expect(walletService.restore(viewerUserId, walletId)).rejects.toThrow(
        'Chỉ chủ ví mới có quyền phục hồi ví đã lưu trữ',
      );
    });

    it('should allow restore when caller is the OWNER of the wallet', async () => {
      const ownerUserId = 'owner-user-uuid';
      const walletId = 'owner-wallet-uuid';

      jest.spyOn(walletService, 'findById').mockResolvedValue({
        id: walletId,
        userId: ownerUserId,
        myRole: 'OWNER',
        isArchived: true,
      } as any);

      const restoreSpy = jest.spyOn((walletService as any).repository, 'restore').mockResolvedValue({
        id: walletId,
        userId: ownerUserId,
        isArchived: false,
        myRole: 'OWNER',
      });
      jest.spyOn<any, any>(walletService, 'invalidateReportCache').mockResolvedValue(undefined);

      const result = await walletService.restore(ownerUserId, walletId);
      expect(result.isArchived).toBe(false);
      expect(restoreSpy).toHaveBeenCalledWith(ownerUserId, walletId);

      restoreSpy.mockRestore();
    });
  });

  describe('SEC-W2-04: Term-Lock Bypass Defense on Transfer Reversal (delete)', () => {
    const transferService = new TransferService();

    it('should reject deleting transfer when destinationWallet is SAVINGS_ACCOUNT', async () => {
      const userId = '01a0b566-b93e-7991-92d9-7103c9752210';
      const transferId = '01a0b566-b93e-7991-92d9-7103c9752211';
      const sourceWalletId = '01a0b566-b93e-7991-92d9-7103c9752212';
      const destSavingsWalletId = '01a0b566-b93e-7991-92d9-7103c9752213';

      jest.spyOn((transferService as any).repository, 'findById').mockResolvedValue({
        id: transferId,
        sourceWalletId,
        destinationWalletId: destSavingsWalletId,
        amount: '1000000.00',
      });

      jest.spyOn((transferService as any).repository, 'findWallets').mockResolvedValue([
        { id: sourceWalletId, balance: new Prisma.Decimal(5000000), isArchived: false, type: 'STANDARD' },
        { id: destSavingsWalletId, balance: new Prisma.Decimal(1000000), isArchived: false, type: 'SAVINGS_ACCOUNT' },
      ]);

      await expect(transferService.delete(userId, transferId)).rejects.toThrow(
        'Sổ tiết kiệm đang bị khóa kỳ hạn. Không thể đảo ngược lệnh chuyển tiền để rút tiền trực tiếp từ sổ.',
      );
    });

    it('should allow deleting transfer when both wallets are standard wallets', async () => {
      const userId = '01a0b566-b93e-7991-92d9-7103c9752210';
      const transferId = '01a0b566-b93e-7991-92d9-7103c9752211';
      const sourceWalletId = '01a0b566-b93e-7991-92d9-7103c9752212';
      const destWalletId = '01a0b566-b93e-7991-92d9-7103c9752214';

      jest.spyOn((transferService as any).repository, 'findById').mockResolvedValue({
        id: transferId,
        sourceWalletId,
        destinationWalletId: destWalletId,
        amount: '500000.00',
      });

      jest.spyOn((transferService as any).repository, 'findWallets').mockResolvedValue([
        { id: sourceWalletId, balance: new Prisma.Decimal(1000000), isArchived: false, type: 'STANDARD' },
        { id: destWalletId, balance: new Prisma.Decimal(500000), isArchived: false, type: 'STANDARD' },
      ]);

      jest.spyOn((transferService as any).repository, 'debitWallet').mockResolvedValue({ count: 1 });
      jest.spyOn((transferService as any).repository, 'incrementWallet').mockResolvedValue({ id: sourceWalletId });
      jest.spyOn((transferService as any).repository, 'delete').mockResolvedValue({ id: transferId });
      jest.spyOn<any, any>(transferService, 'invalidateReportCache').mockResolvedValue(undefined);

      const result = await transferService.delete(userId, transferId);
      expect(result.id).toBe(transferId);
    });
  });

  describe('SEC-W2-05: Consistent Full Month Range in Shared Wallet GetMembers', () => {
    it('should calculate endOfMonth spanning to the actual last day of month in getMembers', async () => {
      const walletId = '01a0b566-b93e-7991-92d9-7103c9752220';
      const ownerId = '01a0b566-b93e-7991-92d9-7103c9752221';

      jest.spyOn((sharedWalletService as any).repository, 'findUserWalletRole').mockResolvedValue('OWNER');
      jest.spyOn((sharedWalletService as any).repository, 'findWallet').mockResolvedValue({
        id: walletId,
        userId: ownerId,
        createdAt: new Date(),
        user: { fullName: 'Owner', avatarUrl: null },
      });
      jest.spyOn((sharedWalletService as any).repository, 'findMembers').mockResolvedValue([]);

      const spentSpy = jest
        .spyOn((sharedWalletService as any).repository, 'getMemberSpentInDateRange')
        .mockResolvedValue(new Prisma.Decimal(0));

      await sharedWalletService.getMembers(ownerId, walletId);

      expect(spentSpy).toHaveBeenCalled();
      const fromDate = spentSpy.mock.calls[0][2] as Date;
      const toDate = spentSpy.mock.calls[0][3] as Date;

      expect(toDate.getTime()).toBeGreaterThan(fromDate.getTime());
      expect(toDate.getUTCDate()).toBeGreaterThanOrEqual(28);

      spentSpy.mockRestore();
    });
  });

  describe('SEC-W2-06: Owner Visibility on Member Transactions in Default Feed', () => {
    it('should include { wallet: { userId } } in scopeCondition when spendingScope is not specified', async () => {
      const transactionRepo = new TransactionRepository();
      const uniqueSuffix = Date.now().toString().slice(-6);

      const defaultRole = await prisma.role.findFirst({ where: { name: 'USER' } });

      const owner = await prisma.user.create({
        data: {
          email: `owner_${uniqueSuffix}@example.com`,
          phoneNumber: `+8498888${uniqueSuffix}`,
          password: 'dummy',
          fullName: 'Owner User',
          roleId: defaultRole!.id,
          isActive: true,
        },
      });

      const member = await prisma.user.create({
        data: {
          email: `member_${uniqueSuffix}@example.com`,
          phoneNumber: `+8498889${uniqueSuffix}`,
          password: 'dummy',
          fullName: 'Member User',
          roleId: defaultRole!.id,
          isActive: true,
        },
      });

      const category = await prisma.category.findFirst({
        where: { isSystem: true, type: 'EXPENSE' },
      });

      const wallet = await prisma.wallet.create({
        data: {
          name: `Shared Wallet ${uniqueSuffix}`,
          balance: new Prisma.Decimal(1000000),
          currency: 'VND',
          type: 'STANDARD',
          userId: owner.id,
        },
      });

      await prisma.walletMember.create({
        data: {
          walletId: wallet.id,
          userId: member.id,
          role: 'MEMBER',
          status: 'ACTIVE',
        },
      });

      const memberTx = await prisma.transaction.create({
        data: {
          userId: member.id,
          walletId: wallet.id,
          amount: new Prisma.Decimal(50000),
          type: 'EXPENSE',
          date: new Date(),
          categoryId: category!.id,
          description: 'Member purchase in shared wallet',
        },
      });

      // Owner calls findAll without spendingScope -> default feed
      const ownerFeed = await transactionRepo.findAll(owner.id, {
        page: 1,
        limit: 10,
        sortBy: 'date',
        order: 'desc',
      });

      // Owner must see memberTx because of { wallet: { userId: owner.id } }
      expect(ownerFeed.data.some((t) => t.id === memberTx.id)).toBe(true);

      // Clean up
      await prisma.transaction.delete({ where: { id: memberTx.id } });
      await prisma.walletMember.deleteMany({ where: { walletId: wallet.id } });
      await prisma.wallet.delete({ where: { id: wallet.id } });
      await prisma.user.deleteMany({ where: { id: { in: [owner.id, member.id] } } });
    });
  });

  describe('SEC-W2-07: Receipt Management Authorization & VIEWER Role Defense', () => {
    it('should reject uploadReceipt when caller is a VIEWER in the wallet', async () => {
      const viewerUserId = 'viewer-user-uuid';
      const transactionId = 'txn-uuid-1';
      const walletId = 'wallet-uuid-1';

      jest.spyOn(transactionService, 'findById').mockResolvedValue({
        id: transactionId,
        walletId,
      } as any);

      jest.spyOn(((transactionService as any).sharedWalletService as any).repository, 'findUserWalletRole')
        .mockResolvedValue(WalletMemberRole.VIEWER);

      const fakeFile: any = {
        mimetype: 'image/jpeg',
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
        size: 100,
      };

      await expect(transactionService.uploadReceipt(viewerUserId, transactionId, fakeFile)).rejects.toThrow(
        'Tài khoản chỉ có quyền xem, không được phép xóa giao dịch trong ví này',
      );
    });

    it('should reject deleteReceipt when caller is a VIEWER in the wallet', async () => {
      const viewerUserId = 'viewer-user-uuid';
      const transactionId = 'txn-uuid-1';
      const walletId = 'wallet-uuid-1';

      jest.spyOn(transactionService, 'findById').mockResolvedValue({
        id: transactionId,
        walletId,
      } as any);

      jest.spyOn(((transactionService as any).sharedWalletService as any).repository, 'findUserWalletRole')
        .mockResolvedValue(WalletMemberRole.VIEWER);

      await expect(transactionService.deleteReceipt(viewerUserId, transactionId)).rejects.toThrow(
        'Tài khoản chỉ có quyền xem, không được phép xóa giao dịch trong ví này',
      );
    });

    it('should allow wallet owner to replace receipt even if creator is different', async () => {
      const ownerUserId = 'owner-uuid';
      const creatorUserId = 'member-uuid';
      const transactionId = 'txn-uuid-1';
      const walletId = 'wallet-uuid-1';

      jest.spyOn(transactionService, 'findById').mockResolvedValue({
        id: transactionId,
        userId: creatorUserId,
        walletId,
      } as any);

      jest.spyOn(((transactionService as any).sharedWalletService as any).repository, 'findUserWalletRole')
        .mockResolvedValue(WalletMemberRole.OWNER);

      jest.spyOn((transactionService as any).repository, 'replaceReceipt').mockResolvedValue({
        transaction: { id: transactionId, receiptUrl: null },
        previousReceiptKey: 'receipts/old.jpg',
      });
      jest.spyOn((transactionService as any).receiptFiles, 'remove').mockResolvedValue(undefined);
      jest.spyOn<any, any>(transactionService, 'invalidateReportCache').mockResolvedValue(undefined);

      const result = await transactionService.deleteReceipt(ownerUserId, transactionId);
      expect(result.id).toBe(transactionId);
    });
  });
});

