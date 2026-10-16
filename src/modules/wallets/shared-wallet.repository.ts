import { Prisma, WalletMemberRole, WalletMemberStatus, WalletInvitationStatus } from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import { businessDateToPrismaDate } from '../../common/date-time/business-time';

export class SharedWalletRepository {
  findWallet(walletId: string) {
    return prisma.wallet.findUnique({
      where: { id: walletId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
        members: {
          where: { status: WalletMemberStatus.ACTIVE },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
  }

  async findUserWalletRole(walletId: string, userId: string): Promise<WalletMemberRole | null> {
    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId },
      select: { userId: true },
    });

    if (!wallet) return null;
    if (wallet.userId === userId) return WalletMemberRole.OWNER;

    const membership = await prisma.walletMember.findUnique({
      where: {
        walletId_userId: {
          walletId,
          userId,
        },
      },
      select: { role: true, status: true },
    });

    if (membership && membership.status === WalletMemberStatus.ACTIVE) {
      return membership.role;
    }

    return null;
  }

  createInvitation(data: {
    walletId: string;
    inviterId: string;
    role: WalletMemberRole;
    inviteCode: string;
    expiresAt: Date;
  }) {
    return prisma.walletInvitation.create({
      data: {
        walletId: data.walletId,
        inviterId: data.inviterId,
        role: data.role,
        inviteCode: data.inviteCode,
        expiresAt: data.expiresAt,
        status: WalletInvitationStatus.PENDING,
      },
      include: {
        wallet: {
          select: { id: true, name: true },
        },
        inviter: {
          select: { fullName: true },
        },
      },
    });
  }

  findActiveInvitations(walletId: string) {
    return prisma.walletInvitation.findMany({
      where: {
        walletId,
        status: WalletInvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      include: {
        wallet: { select: { id: true, name: true } },
        inviter: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findInvitationById(id: string) {
    return prisma.walletInvitation.findUnique({
      where: { id },
    });
  }

  findInvitationByCode(code: string) {
    return prisma.walletInvitation.findUnique({
      where: { inviteCode: code },
      include: {
        wallet: {
          include: {
            members: {
              where: { status: WalletMemberStatus.ACTIVE },
            },
          },
        },
        inviter: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  updateInvitationStatus(id: string, status: WalletInvitationStatus, acceptedBy?: string) {
    return prisma.walletInvitation.update({
      where: { id },
      data: {
        status,
        ...(acceptedBy ? { acceptedBy, acceptedAt: new Date() } : {}),
      },
    });
  }

  findMember(walletId: string, userId: string) {
    return prisma.walletMember.findUnique({
      where: {
        walletId_userId: {
          walletId,
          userId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  findMemberById(id: string) {
    return prisma.walletMember.findUnique({
      where: { id },
      include: {
        wallet: true,
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  findMembers(walletId: string) {
    return prisma.walletMember.findMany({
      where: {
        walletId,
        status: WalletMemberStatus.ACTIVE,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async addMember(data: {
    walletId: string;
    userId: string;
    role: WalletMemberRole;
    nickname?: string | null;
  }) {
    return prisma.$transaction(async (tx) => {
      const member = await tx.walletMember.upsert({
        where: {
          walletId_userId: {
            walletId: data.walletId,
            userId: data.userId,
          },
        },
        create: {
          walletId: data.walletId,
          userId: data.userId,
          role: data.role,
          nickname: data.nickname,
          status: WalletMemberStatus.ACTIVE,
          joinedAt: new Date(),
        },
        update: {
          role: data.role,
          nickname: data.nickname,
          status: WalletMemberStatus.ACTIVE,
          joinedAt: new Date(),
        },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
            },
          },
        },
      });

      await tx.wallet.update({
        where: { id: data.walletId },
        data: { isShared: true },
      });

      return member;
    });
  }

  updateMember(id: string, data: {
    role?: WalletMemberRole;
    nickname?: string | null;
    monthlySpendingLimit?: Prisma.Decimal | null;
  }) {
    return prisma.walletMember.update({
      where: { id },
      data: {
        ...(data.role ? { role: data.role } : {}),
        ...(data.nickname !== undefined ? { nickname: data.nickname } : {}),
        ...(data.monthlySpendingLimit !== undefined ? { monthlySpendingLimit: data.monthlySpendingLimit } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  async removeMember(walletId: string, memberId: string) {
    return prisma.$transaction(async (tx) => {
      const removed = await tx.walletMember.update({
        where: { id: memberId },
        data: { status: WalletMemberStatus.LEFT },
      });

      const remainingActive = await tx.walletMember.count({
        where: { walletId, status: WalletMemberStatus.ACTIVE },
      });

      if (remainingActive === 0) {
        await tx.wallet.update({
          where: { id: walletId },
          data: { isShared: false },
        });
      }

      return removed;
    });
  }

  async getMemberSpentInDateRange(
    walletId: string,
    userId: string,
    fromDate: Date,
    toDate: Date,
  ): Promise<Prisma.Decimal> {
    const aggregate = await prisma.transaction.aggregate({
      where: {
        walletId,
        userId,
        type: 'EXPENSE',
        date: {
          gte: fromDate,
          lte: toDate,
        },
      },
      _sum: {
        amount: true,
      },
    });

    return aggregate._sum.amount ?? new Prisma.Decimal(0);
  }

  async getWalletTransactions(
    walletId: string,
    fromDate: Date,
    toDate: Date,
  ) {
    return prisma.transaction.findMany({
      where: {
        walletId,
        date: {
          gte: fromDate,
          lte: toDate,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            icon: true,
            color: true,
          },
        },
      },
      orderBy: { date: 'asc' },
    });
  }

  async getIncomingTransfers(
    walletId: string,
    fromDate: Date,
    toDate: Date,
  ) {
    return prisma.transfer.findMany({
      where: {
        destinationWalletId: walletId,
        transferredAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  async findUserName(userId: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true },
    });
    return user?.fullName ?? null;
  }

  async acceptInvitationAtomic(data: {
    invitationId: string;
    walletId: string;
    userId: string;
    role: WalletMemberRole;
    nickname?: string | null;
  }) {
    return prisma.$transaction(async (tx) => {
      const updateResult = await tx.walletInvitation.updateMany({
        where: {
          id: data.invitationId,
          status: WalletInvitationStatus.PENDING,
        },
        data: {
          status: WalletInvitationStatus.ACCEPTED,
          acceptedBy: data.userId,
          acceptedAt: new Date(),
        },
      });

      if (updateResult.count === 0) {
        return null;
      }

      const member = await tx.walletMember.upsert({
        where: {
          walletId_userId: {
            walletId: data.walletId,
            userId: data.userId,
          },
        },
        create: {
          walletId: data.walletId,
          userId: data.userId,
          role: data.role,
          nickname: data.nickname,
          status: WalletMemberStatus.ACTIVE,
          joinedAt: new Date(),
        },
        update: {
          role: data.role,
          nickname: data.nickname,
          status: WalletMemberStatus.ACTIVE,
          joinedAt: new Date(),
        },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
            },
          },
        },
      });

      await tx.wallet.update({
        where: { id: data.walletId },
        data: { isShared: true },
      });

      return member;
    });
  }
}
