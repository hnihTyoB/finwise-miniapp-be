import crypto from 'crypto';
import QRCode from 'qrcode';
import { Prisma, WalletMemberRole, WalletMemberStatus, WalletInvitationStatus, NotificationType, NotificationPriority, NotificationSourceType } from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import { SharedWalletRepository } from './shared-wallet.repository';
import { NotificationService } from '../notifications/notification.service';
import { cacheService } from '../../common/services/cache.service';
import {
  businessDateToPrismaDate,
  prismaDateToBusinessDate,
  instantToBusinessDate,
} from '../../common/date-time/business-time';
import {
  AcceptInvitationDto,
  CreateInvitationDto,
  InvitationPreviewResponseDto,
  InvitationResponseDto,
  SharedWalletAnalyticsDto,
  UpdateMemberDto,
  WalletMemberResponseDto,
} from './shared-wallet.dto';

const todayInBusinessTime = () => instantToBusinessDate(new Date());

export class SharedWalletService {
  private readonly repository = new SharedWalletRepository();
  private readonly notificationService = new NotificationService();

  private generateInviteCode(): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = 'FW-';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i += 1) {
      code += chars[bytes[i] % chars.length];
    }
    return code;
  }

  async createInvitation(
    userId: string,
    walletId: string,
    dto: CreateInvitationDto,
  ): Promise<InvitationResponseDto> {
    const role = await this.repository.findUserWalletRole(walletId, userId);
    if (role !== WalletMemberRole.OWNER) {
      throw new AppError('Chỉ chủ ví mới có quyền tạo mã mời thành viên', 403, ERROR_CODE.FORBIDDEN);
    }

    const wallet = await this.repository.findWallet(walletId);
    if (!wallet) {
      throw new AppError('Ví không tồn tại', 404, ERROR_CODE.NOT_FOUND);
    }

    if (wallet.isArchived) {
      throw new AppError('Không thể mời thành viên vào ví đã lưu trữ', 409, ERROR_CODE.WALLET_ARCHIVED);
    }

    const expireDays = dto.expireDays ?? 7;
    const expiresAt = new Date(Date.now() + expireDays * 24 * 60 * 60 * 1000);
    const inviteCode = this.generateInviteCode();

    const invitePayload = JSON.stringify({
      app: 'finwise',
      type: 'shared_wallet_invite',
      code: inviteCode,
    });
    const qrCodeDataUrl = await QRCode.toDataURL(invitePayload, {
      margin: 2,
      scale: 6,
      color: {
        dark: '#2D2A45',
        light: '#FFFFFF',
      },
    });

    const invitation = await this.repository.createInvitation({
      walletId,
      inviterId: userId,
      role: dto.role ?? WalletMemberRole.MEMBER,
      inviteCode,
      expiresAt,
    });

    return {
      id: invitation.id,
      walletId: invitation.walletId,
      walletName: invitation.wallet.name,
      inviterName: invitation.inviter.fullName || 'Người dùng FinWise',
      role: invitation.role,
      inviteCode: invitation.inviteCode,
      qrCodeDataUrl,
      expiresAt: invitation.expiresAt.toISOString(),
      status: invitation.status,
      createdAt: invitation.createdAt.toISOString(),
    };
  }

  async getInvitations(userId: string, walletId: string): Promise<InvitationResponseDto[]> {
    const role = await this.repository.findUserWalletRole(walletId, userId);
    if (role !== WalletMemberRole.OWNER) {
      throw new AppError('Chỉ chủ ví mới có quyền xem danh sách mã mời', 403, ERROR_CODE.FORBIDDEN);
    }

    const invitations = await this.repository.findActiveInvitations(walletId);
    const results: InvitationResponseDto[] = [];

    for (const inv of invitations) {
      const invitePayload = JSON.stringify({
        app: 'finwise',
        type: 'shared_wallet_invite',
        code: inv.inviteCode,
      });
      const qrCodeDataUrl = await QRCode.toDataURL(invitePayload, { margin: 2, scale: 6 });
      results.push({
        id: inv.id,
        walletId: inv.walletId,
        walletName: inv.wallet.name,
        inviterName: inv.inviter.fullName || 'Người dùng FinWise',
        role: inv.role,
        inviteCode: inv.inviteCode,
        qrCodeDataUrl,
        expiresAt: inv.expiresAt.toISOString(),
        status: inv.status,
        createdAt: inv.createdAt.toISOString(),
      });
    }

    return results;
  }

  async cancelInvitation(userId: string, walletId: string, invitationId: string) {
    const role = await this.repository.findUserWalletRole(walletId, userId);
    if (role !== WalletMemberRole.OWNER) {
      throw new AppError('Chỉ chủ ví mới có quyền hủy mã mời', 403, ERROR_CODE.FORBIDDEN);
    }

    const invitation = await this.repository.findInvitationById(invitationId);
    if (!invitation || invitation.walletId !== walletId) {
      throw new AppError('Mã mời không tồn tại', 404, ERROR_CODE.WALLET_INVITATION_NOT_FOUND);
    }

    if (invitation.status !== WalletInvitationStatus.PENDING) {
      throw new AppError('Chỉ có thể hủy mã mời đang ở trạng thái chờ', 400, ERROR_CODE.VALIDATION_ERROR);
    }

    await this.repository.updateInvitationStatus(invitationId, WalletInvitationStatus.REVOKED);
    return { success: true };
  }

  async previewInvitation(code: string): Promise<InvitationPreviewResponseDto> {
    const invitation = await this.repository.findInvitationByCode(code.trim().toUpperCase());
    if (!invitation) {
      throw new AppError('Mã mời không tồn tại', 404, ERROR_CODE.WALLET_INVITATION_NOT_FOUND);
    }

    if (invitation.status !== WalletInvitationStatus.PENDING) {
      throw new AppError('Mã mời đã được sử dụng hoặc bị hủy', 409, ERROR_CODE.WALLET_INVITATION_ALREADY_USED);
    }

    if (invitation.wallet.isArchived) {
      throw new AppError('Ví đã được lưu trữ, không thể tham gia', 409, ERROR_CODE.WALLET_ARCHIVED);
    }

    if (invitation.expiresAt < new Date()) {
      throw new AppError('Mã mời đã hết hạn', 410, ERROR_CODE.WALLET_INVITATION_EXPIRED);
    }

    return {
      walletId: invitation.wallet.id,
      walletName: invitation.wallet.name,
      currency: invitation.wallet.currency,
      inviterName: invitation.inviter.fullName || 'Người dùng FinWise',
      inviterAvatarUrl: invitation.inviter.avatarUrl,
      role: invitation.role,
      membersCount: invitation.wallet.members.length + 1, // members + owner
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async acceptInvitation(userId: string, dto: AcceptInvitationDto): Promise<WalletMemberResponseDto> {
    const code = dto.inviteCode.trim().toUpperCase();
    const invitation = await this.repository.findInvitationByCode(code);

    if (!invitation) {
      throw new AppError('Mã mời không tồn tại', 404, ERROR_CODE.WALLET_INVITATION_NOT_FOUND);
    }

    if (invitation.status !== WalletInvitationStatus.PENDING) {
      throw new AppError('Mã mời đã được sử dụng hoặc bị hủy', 409, ERROR_CODE.WALLET_INVITATION_ALREADY_USED);
    }

    if (invitation.wallet.isArchived) {
      throw new AppError('Ví đã được lưu trữ, không thể tham gia', 409, ERROR_CODE.WALLET_ARCHIVED);
    }

    if (invitation.expiresAt < new Date()) {
      throw new AppError('Mã mời đã hết hạn', 410, ERROR_CODE.WALLET_INVITATION_EXPIRED);
    }

    if (invitation.wallet.userId === userId) {
      throw new AppError('Bạn đã là chủ sở hữu của ví này', 400, ERROR_CODE.WALLET_CANNOT_INVITE_SELF);
    }

    const existingMember = await this.repository.findMember(invitation.walletId, userId);
    if (existingMember && existingMember.status === WalletMemberStatus.ACTIVE) {
      throw new AppError('Bạn đã là thành viên của ví này', 409, ERROR_CODE.WALLET_ALREADY_MEMBER);
    }

    const member = await this.repository.acceptInvitationAtomic({
      invitationId: invitation.id,
      walletId: invitation.walletId,
      userId,
      role: invitation.role,
      nickname: dto.nickname?.trim() || null,
    });

    if (!member) {
      throw new AppError('Mã mời đã được sử dụng hoặc bị hủy', 409, ERROR_CODE.WALLET_INVITATION_ALREADY_USED);
    }

    // Invalidate caches
    await Promise.all([
      cacheService.clearPattern(`finwise:cache:reports:${userId}:*`),
      cacheService.clearPattern(`finwise:cache:reports:${invitation.wallet.userId}:*`),
    ]);

    // Send notification to wallet owner
    try {
      await this.notificationService.create({
        userId: invitation.wallet.userId,
        type: NotificationType.SHARED_WALLET_MEMBER_JOINED,
        priority: NotificationPriority.NORMAL,
        title: 'Thành viên mới tham gia ví dùng chung',
        message: `${member.user.fullName || 'Một thành viên'} đã tham gia vào ví "${invitation.wallet.name}".`,
        actionUrl: `/wallets/${invitation.walletId}`,
        sourceType: NotificationSourceType.SYSTEM,
        sourceId: member.id,
        dedupKey: `shared_wallet_joined:${invitation.walletId}:${userId}`,
      });
    } catch (err) {
      console.error('[SharedWallet] Failed to emit join notification:', err);
    }

    return {
      id: member.id,
      userId: member.userId,
      fullName: member.user.fullName,
      avatarUrl: member.user.avatarUrl,
      user: {
        id: member.userId,
        fullName: member.user.fullName,
        avatarUrl: member.user.avatarUrl,
      },
      role: member.role,
      nickname: member.nickname,
      monthlySpendingLimit: member.monthlySpendingLimit?.toFixed(2) ?? null,
      currentMonthSpent: '0.00',
      status: member.status,
      joinedAt: member.joinedAt.toISOString(),
    };
  }

  async getMembers(userId: string, walletId: string): Promise<WalletMemberResponseDto[]> {
    const userRole = await this.repository.findUserWalletRole(walletId, userId);
    if (!userRole) {
      throw new AppError('Bạn không có quyền truy cập ví này', 403, ERROR_CODE.FORBIDDEN);
    }

    const wallet = await this.repository.findWallet(walletId);
    if (!wallet) {
      throw new AppError('Ví không tồn tại', 404, ERROR_CODE.NOT_FOUND);
    }

    // Determine current month range in UTC+7
    const today = todayInBusinessTime();
    const [year, month] = today.split('-').map(Number);
    const startOfMonth = businessDateToPrismaDate(`${year}-${String(month).padStart(2, '0')}-01`);
    const endOfMonth = businessDateToPrismaDate(today);

    const members = await this.repository.findMembers(walletId);
    const results: WalletMemberResponseDto[] = [];

    // Add owner as the first member
    const ownerSpent = await this.repository.getMemberSpentInDateRange(
      walletId,
      wallet.userId,
      startOfMonth,
      endOfMonth,
    );
    results.push({
      id: `owner-${wallet.userId}`,
      userId: wallet.userId,
      fullName: wallet.user.fullName,
      avatarUrl: wallet.user.avatarUrl,
      user: {
        id: wallet.userId,
        fullName: wallet.user.fullName,
        avatarUrl: wallet.user.avatarUrl,
      },
      role: WalletMemberRole.OWNER,
      nickname: 'Chủ ví',
      monthlySpendingLimit: null,
      currentMonthSpent: ownerSpent.toFixed(2),
      status: WalletMemberStatus.ACTIVE,
      joinedAt: wallet.createdAt.toISOString(),
    });

    // Add other active members
    for (const m of members) {
      const spent = await this.repository.getMemberSpentInDateRange(
        walletId,
        m.userId,
        startOfMonth,
        endOfMonth,
      );
      results.push({
        id: m.id,
        userId: m.userId,
        fullName: m.user.fullName,
        avatarUrl: m.user.avatarUrl,
        user: {
          id: m.userId,
          fullName: m.user.fullName,
          avatarUrl: m.user.avatarUrl,
        },
        role: m.role,
        nickname: m.nickname,
        monthlySpendingLimit: m.monthlySpendingLimit?.toFixed(2) ?? null,
        currentMonthSpent: spent.toFixed(2),
        status: m.status,
        joinedAt: m.joinedAt.toISOString(),
      });
    }

    return results;
  }

  async updateMember(
    userId: string,
    walletId: string,
    memberId: string,
    dto: UpdateMemberDto,
  ): Promise<WalletMemberResponseDto> {
    const userRole = await this.repository.findUserWalletRole(walletId, userId);
    if (userRole !== WalletMemberRole.OWNER) {
      throw new AppError('Chỉ chủ ví mới có quyền chỉnh sửa thành viên', 403, ERROR_CODE.FORBIDDEN);
    }

    const member = await this.repository.findMemberById(memberId);
    if (!member || member.walletId !== walletId) {
      throw new AppError('Thành viên không tồn tại trong ví này', 404, ERROR_CODE.WALLET_MEMBER_NOT_FOUND);
    }

    const updated = await this.repository.updateMember(memberId, {
      role: dto.role,
      nickname: dto.nickname,
      monthlySpendingLimit: dto.monthlySpendingLimit !== undefined
        ? (dto.monthlySpendingLimit ? new Prisma.Decimal(dto.monthlySpendingLimit) : null)
        : undefined,
    });

    const today = todayInBusinessTime();
    const [year, month] = today.split('-').map(Number);
    const startOfMonth = businessDateToPrismaDate(`${year}-${String(month).padStart(2, '0')}-01`);
    const endOfMonth = businessDateToPrismaDate(today);

    const spent = await this.repository.getMemberSpentInDateRange(
      walletId,
      updated.userId,
      startOfMonth,
      endOfMonth,
    );

    return {
      id: updated.id,
      userId: updated.userId,
      fullName: updated.user.fullName,
      avatarUrl: updated.user.avatarUrl,
      user: {
        id: updated.userId,
        fullName: updated.user.fullName,
        avatarUrl: updated.user.avatarUrl,
      },
      role: updated.role,
      nickname: updated.nickname,
      monthlySpendingLimit: updated.monthlySpendingLimit?.toFixed(2) ?? null,
      currentMonthSpent: spent.toFixed(2),
      status: updated.status,
      joinedAt: updated.joinedAt.toISOString(),
    };
  }

  async removeMember(userId: string, walletId: string, memberId: string) {
    const userRole = await this.repository.findUserWalletRole(walletId, userId);
    if (userRole !== WalletMemberRole.OWNER) {
      throw new AppError('Chỉ chủ ví mới có quyền xóa thành viên', 403, ERROR_CODE.FORBIDDEN);
    }

    const member = await this.repository.findMemberById(memberId);
    if (!member || member.walletId !== walletId) {
      throw new AppError('Thành viên không tồn tại trong ví này', 404, ERROR_CODE.WALLET_MEMBER_NOT_FOUND);
    }

    await this.repository.removeMember(walletId, memberId);

    // Notify removed member
    try {
      await this.notificationService.create({
        userId: member.userId,
        type: NotificationType.SHARED_WALLET_MEMBER_REMOVED,
        priority: NotificationPriority.NORMAL,
        title: 'Bạn đã được mời ra khỏi ví dùng chung',
        message: `Chủ ví đã xóa bạn khỏi ví "${member.wallet.name}".`,
        actionUrl: '/wallets',
        sourceType: NotificationSourceType.SYSTEM,
        sourceId: walletId,
        dedupKey: `shared_wallet_removed:${walletId}:${member.userId}`,
      });
    } catch (err) {
      console.error('[SharedWallet] Failed to emit remove notification:', err);
    }

    return { success: true };
  }

  async leaveWallet(userId: string, walletId: string) {
    const wallet = await this.repository.findWallet(walletId);
    if (!wallet) {
      throw new AppError('Ví không tồn tại', 404, ERROR_CODE.NOT_FOUND);
    }

    if (wallet.userId === userId) {
      throw new AppError('Chủ ví không thể tự rời khỏi ví. Hãy xóa ví hoặc chuyển quyền chủ sở hữu.', 400, ERROR_CODE.WALLET_OWNER_CANNOT_LEAVE);
    }

    const member = await this.repository.findMember(walletId, userId);
    if (!member || member.status !== WalletMemberStatus.ACTIVE) {
      throw new AppError('Bạn không phải là thành viên hoạt động trong ví này', 404, ERROR_CODE.WALLET_MEMBER_NOT_FOUND);
    }

    await this.repository.removeMember(walletId, member.id);

    // Notify owner
    try {
      await this.notificationService.create({
        userId: wallet.userId,
        type: NotificationType.SHARED_WALLET_MEMBER_REMOVED,
        priority: NotificationPriority.NORMAL,
        title: 'Thành viên đã rời khỏi ví dùng chung',
        message: `${member.user.fullName || 'Một thành viên'} đã tự rời khỏi ví "${wallet.name}".`,
        actionUrl: `/wallets/${walletId}`,
        sourceType: NotificationSourceType.SYSTEM,
        sourceId: member.id,
        dedupKey: `shared_wallet_left:${walletId}:${userId}`,
      });
    } catch (err) {
      console.error('[SharedWallet] Failed to emit leave notification:', err);
    }

    return { success: true };
  }

  async getAnalytics(
    userId: string,
    walletId: string,
    fromStr?: string,
    toStr?: string,
  ): Promise<SharedWalletAnalyticsDto> {
    const userRole = await this.repository.findUserWalletRole(walletId, userId);
    if (!userRole) {
      throw new AppError('Bạn không có quyền truy cập ví này', 403, ERROR_CODE.FORBIDDEN);
    }

    const wallet = await this.repository.findWallet(walletId);
    if (!wallet) {
      throw new AppError('Ví không tồn tại', 404, ERROR_CODE.NOT_FOUND);
    }

    const today = todayInBusinessTime();
    const fromDateStr = fromStr || `${today.slice(0, 7)}-01`;
    const toDateStr = toStr || today;

    const fromDate = businessDateToPrismaDate(fromDateStr);
    const toDate = businessDateToPrismaDate(toDateStr);

    const [transactions, transfers, members] = await Promise.all([
      this.repository.getWalletTransactions(walletId, fromDate, toDate),
      this.repository.getIncomingTransfers(walletId, fromDate, toDate),
      this.repository.findMembers(walletId),
    ]);

    let totalIncome = new Prisma.Decimal(0);
    let totalExpense = new Prisma.Decimal(0);

    // Track spending and transaction count by member
    const spentByMember = new Map<string, { amount: Prisma.Decimal; count: number }>();
    // Track fund injections by member
    const injectedByMember = new Map<string, Prisma.Decimal>();

    for (const t of transactions) {
      if (t.type === 'EXPENSE') {
        totalExpense = totalExpense.plus(t.amount);
        const current = spentByMember.get(t.userId) || { amount: new Prisma.Decimal(0), count: 0 };
        current.amount = current.amount.plus(t.amount);
        current.count += 1;
        spentByMember.set(t.userId, current);
      } else if (t.type === 'INCOME') {
        totalIncome = totalIncome.plus(t.amount);
        const currentInjected = injectedByMember.get(t.userId) || new Prisma.Decimal(0);
        injectedByMember.set(t.userId, currentInjected.plus(t.amount));
      }
    }

    for (const tr of transfers) {
      totalIncome = totalIncome.plus(tr.amount);
      const currentInjected = injectedByMember.get(tr.userId) || new Prisma.Decimal(0);
      injectedByMember.set(tr.userId, currentInjected.plus(tr.amount));
    }

    // Prepare all participants (owner + active members)
    const allParticipants: Array<{
      userId: string;
      fullName: string | null;
      avatarUrl: string | null;
      nickname: string | null;
      role: WalletMemberRole;
      monthlyLimit: Prisma.Decimal | null;
    }> = [
      {
        userId: wallet.userId,
        fullName: wallet.user.fullName,
        avatarUrl: wallet.user.avatarUrl,
        nickname: 'Chủ ví',
        role: WalletMemberRole.OWNER,
        monthlyLimit: null,
      },
      ...members.map((m) => ({
        userId: m.userId,
        fullName: m.user.fullName,
        avatarUrl: m.user.avatarUrl,
        nickname: m.nickname,
        role: m.role,
        monthlyLimit: m.monthlySpendingLimit,
      })),
    ];

    const memberBreakdown = allParticipants.map((p) => {
      const stats = spentByMember.get(p.userId) || { amount: new Prisma.Decimal(0), count: 0 };
      const percentage = totalExpense.greaterThan(0)
        ? Math.round(stats.amount.dividedBy(totalExpense).toNumber() * 1000) / 10
        : 0;

      let limitUsagePercentage: number | null = null;
      if (p.monthlyLimit && p.monthlyLimit.greaterThan(0)) {
        limitUsagePercentage = Math.round(stats.amount.dividedBy(p.monthlyLimit).toNumber() * 1000) / 10;
      }

      return {
        userId: p.userId,
        fullName: p.fullName,
        avatarUrl: p.avatarUrl,
        nickname: p.nickname,
        role: p.role,
        spentAmount: stats.amount.toFixed(2),
        totalSpent: stats.amount.toFixed(2),
        percentage,
        spendingPercentage: percentage.toFixed(1),
        transactionCount: stats.count,
        monthlyLimit: p.monthlyLimit?.toFixed(2) ?? null,
        limitUsagePercentage,
      };
    });

    const settlementSummary = allParticipants.map((p) => {
      const spent = spentByMember.get(p.userId)?.amount || new Prisma.Decimal(0);
      const injected = injectedByMember.get(p.userId) || new Prisma.Decimal(0);
      const net = injected.minus(spent);

      return {
        userId: p.userId,
        fullName: p.fullName,
        totalInjected: injected.toFixed(2),
        totalSpent: spent.toFixed(2),
        netBalance: net.toFixed(2),
      };
    });

    return {
      walletId: wallet.id,
      walletName: wallet.name,
      currency: wallet.currency,
      period: {
        from: fromDateStr,
        to: toDateStr,
      },
      totalIncome: totalIncome.toFixed(2),
      totalExpense: totalExpense.toFixed(2),
      totalSpent: totalExpense.toFixed(2),
      currentBalance: wallet.balance.toFixed(2),
      memberBreakdown,
      settlementSummary,
    };
  }

  async assertCanCreateTransaction(userId: string, walletId: string, amount: Prisma.Decimal, type: string) {
    const userRole = await this.repository.findUserWalletRole(walletId, userId);
    if (!userRole) {
      throw new AppError('Bạn không có quyền thao tác trên ví này', 403, ERROR_CODE.FORBIDDEN);
    }

    if (userRole === WalletMemberRole.VIEWER) {
      throw new AppError('Tài khoản chỉ có quyền xem, không được phép tạo giao dịch trong ví này', 403, ERROR_CODE.WALLET_READ_ONLY);
    }

    // Check spending quota if EXPENSE
    if (type === 'EXPENSE' && userRole === WalletMemberRole.MEMBER) {
      const member = await this.repository.findMember(walletId, userId);
      if (member?.monthlySpendingLimit) {
        const today = todayInBusinessTime();
        const [year, month] = today.split('-').map(Number);
        const startOfMonth = businessDateToPrismaDate(`${year}-${String(month).padStart(2, '0')}-01`);
        const endOfMonth = businessDateToPrismaDate(today);

        const currentSpent = await this.repository.getMemberSpentInDateRange(
          walletId,
          userId,
          startOfMonth,
          endOfMonth,
        );

        const projectedSpent = currentSpent.plus(amount);
        if (projectedSpent.greaterThan(member.monthlySpendingLimit)) {
          throw new AppError(
            `Khoản chi này vượt quá hạn mức chi tiêu tháng của bạn (${member.monthlySpendingLimit.toFixed(0)} đ). Bạn đã chi ${currentSpent.toFixed(0)} đ.`,
            400,
            ERROR_CODE.MEMBER_SPENDING_LIMIT_EXCEEDED,
          );
        }
      }
    }
  }

  async assertCanUpdateTransaction(
    userId: string,
    currentWalletId: string,
    nextWalletId: string,
    currentAmount: Prisma.Decimal,
    currentType: string,
    nextAmount: Prisma.Decimal,
    nextType: string,
  ) {
    const nextWalletRole = await this.repository.findUserWalletRole(nextWalletId, userId);
    if (!nextWalletRole) {
      throw new AppError('Bạn không có quyền thao tác trên ví đích', 403, ERROR_CODE.FORBIDDEN);
    }

    if (nextWalletRole === WalletMemberRole.VIEWER) {
      throw new AppError('Tài khoản chỉ có quyền xem, không được phép chuyển/sửa giao dịch vào ví này', 403, ERROR_CODE.WALLET_READ_ONLY);
    }

    if (currentWalletId !== nextWalletId) {
      const currentRole = await this.repository.findUserWalletRole(currentWalletId, userId);
      if (currentRole === WalletMemberRole.VIEWER) {
        throw new AppError('Tài khoản chỉ có quyền xem, không được phép chỉnh sửa giao dịch trong ví này', 403, ERROR_CODE.WALLET_READ_ONLY);
      }
    }

    if (nextType === 'EXPENSE' && nextWalletRole === WalletMemberRole.MEMBER) {
      const member = await this.repository.findMember(nextWalletId, userId);
      if (member?.monthlySpendingLimit) {
        const today = todayInBusinessTime();
        const [year, month] = today.split('-').map(Number);
        const startOfMonth = businessDateToPrismaDate(`${year}-${String(month).padStart(2, '0')}-01`);
        const endOfMonth = businessDateToPrismaDate(today);

        const currentSpent = await this.repository.getMemberSpentInDateRange(
          nextWalletId,
          userId,
          startOfMonth,
          endOfMonth,
        );

        const netDelta = (currentWalletId === nextWalletId && currentType === 'EXPENSE')
          ? nextAmount.minus(currentAmount)
          : nextAmount;

        if (netDelta.greaterThan(0)) {
          const projectedSpent = currentSpent.plus(netDelta);
          if (projectedSpent.greaterThan(member.monthlySpendingLimit)) {
            throw new AppError(
              `Khoản chi sửa đổi này vượt quá hạn mức chi tiêu tháng của bạn (${member.monthlySpendingLimit.toFixed(0)} đ). Bạn đã chi ${currentSpent.toFixed(0)} đ.`,
              400,
              ERROR_CODE.MEMBER_SPENDING_LIMIT_EXCEEDED,
            );
          }
        }
      }
    }
  }

  async broadcastTransactionCreated(actorUserId: string, walletId: string, transaction: {
    id: string;
    amount: string;
    type: string;
    description: string | null;
    date: string;
  }) {
    const wallet = await this.repository.findWallet(walletId);
    if (!wallet || !wallet.isShared) return;

    // Send notifications to all other members and the owner
    const recipientUserIds = new Set<string>();
    if (wallet.userId !== actorUserId) {
      recipientUserIds.add(wallet.userId);
    }
    for (const m of wallet.members) {
      if (m.userId !== actorUserId && m.status === WalletMemberStatus.ACTIVE) {
        recipientUserIds.add(m.userId);
      }
    }

    const actorName = (await this.repository.findUserName(actorUserId)) || 'Thành viên';
    const actionText = transaction.type === 'EXPENSE' ? 'đã chi' : 'đã thêm khoản thu';

    for (const recipientId of recipientUserIds) {
      this.notificationService.create({
        userId: recipientId,
        type: NotificationType.SHARED_WALLET_TRANSACTION_ALERT,
        priority: NotificationPriority.NORMAL,
        title: `Giao dịch mới trong ${wallet.name}`,
        message: `${actorName} vừa ${actionText} ${Number(transaction.amount).toLocaleString('vi-VN')} đ ${transaction.description ? `cho "${transaction.description}"` : ''}.`,
        actionUrl: `/wallets/${walletId}`,
        sourceType: NotificationSourceType.TRANSACTION,
        sourceId: transaction.id,
        dedupKey: `shared_txn_alert:${transaction.id}:${recipientId}`,
      }).catch((err) => console.error('[SharedWallet] Failed to emit txn alert:', err));
    }
  }
}
