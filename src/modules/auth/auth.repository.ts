import { prisma } from '../../database/prisma.client';

export class AuthRepository {
  findByEmail(email: string) {
    return prisma.user.findFirst({
      where: { email, deletedAt: null },
      include: { role: true },
    });
  }

  findById(id: string) {
    return prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { role: true },
    });
  }

  async saveRefreshToken(userId: string, token: string, expiresAt: Date, userAgent?: string, ipAddress?: string) {
    return prisma.refreshToken.create({
      data: {
        userId,
        token,
        expiresAt,
        userAgent,
        ipAddress,
      },
    });
  }

  async findRefreshToken(token: string) {
    return prisma.refreshToken.findUnique({
      where: { token },
    });
  }

  async deleteRefreshToken(token: string) {
    return prisma.refreshToken.deleteMany({
      where: { token },
    });
  }

  async rotateRefreshToken(
    oldToken: string,
    newRecord: {
      userId: string;
      token: string;
      expiresAt: Date;
      userAgent?: string;
      ipAddress?: string;
    }
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.refreshToken.deleteMany({ where: { token: oldToken } });
      return tx.refreshToken.create({ data: newRecord });
    });
  }

  async findBySocial(provider: string, providerUserId: string) {
    const socialAccount = await prisma.userSocial.findUnique({
      where: {
        provider_providerUserId: {
          provider,
          providerUserId,
        },
      },
      include: {
        user: {
          include: { role: true },
        },
      },
    });
    return socialAccount?.user || null;
  }

  async createSocialUser(data: {
    fullName?: string;
    avatarUrl?: string;
    phoneNumber?: string;
    roleId: string;
    provider: string;
    providerUserId: string;
  }) {
    return prisma.user.create({
      data: {
        fullName: data.fullName,
        avatarUrl: data.avatarUrl,
        phoneNumber: data.phoneNumber,
        roleId: data.roleId,
        isActive: true, // Social users are active immediately
        socialAccounts: {
          create: {
            provider: data.provider,
            providerUserId: data.providerUserId,
          },
        },
      },
      include: { role: true },
    });
  }

  async linkSocialAccount(userId: string, provider: string, providerUserId: string) {
    return prisma.userSocial.create({
      data: { userId, provider, providerUserId },
    });
  }

  async findUserSocial(userId: string, provider: string) {
    return prisma.userSocial.findFirst({
      where: { userId, provider },
    });
  }

  async unlinkSocialAccount(userId: string, provider: string) {
    return prisma.userSocial.deleteMany({
      where: { userId, provider },
    });
  }

  async createVerificationToken(userId: string, token: string, expiresAt: Date) {
    return prisma.verificationToken.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    });
  }

  async findVerificationToken(token: string) {
    return prisma.verificationToken.findUnique({
      where: { token },
      include: { user: true },
    });
  }

  async activateUser(userId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
    });
  }

  async deleteVerificationToken(tokenId: string) {
    return prisma.verificationToken.delete({
      where: { id: tokenId },
    });
  }

  async findRoleByName(name: string) {
    return prisma.role.findUnique({
      where: { name },
    });
  }

  async createUser(data: {
    email: string;
    passwordHash: string;
    fullName?: string;
    roleId: string;
    isActive: boolean;
  }) {
    return prisma.user.create({
      data: {
        email: data.email,
        password: data.passwordHash,
        fullName: data.fullName,
        roleId: data.roleId,
        isActive: data.isActive,
      },
    });
  }

  async findByPhone(phoneNumber: string) {
    return prisma.user.findFirst({
      where: { phoneNumber, deletedAt: null },
      include: { role: true },
    });
  }

  async updateProfile(userId: string, data: {
    fullName?: string;
    phoneNumber?: string | null;
    avatarUrl?: string | null;
  }) {
    return prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  async updateAvatar(userId: string, data: {
    avatarUrl: string | null;
    avatarPositionX?: number;
    avatarPositionY?: number;
  }) {
    return prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  async updatePassword(userId: string, passwordHash: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { password: passwordHash },
    });
  }

  async softDelete(userId: string, adminId: string) {
    return prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          deletedAt: new Date(),
          deletedBy: adminId,
          isActive: false,
        },
      }),
      prisma.refreshToken.deleteMany({
        where: { userId },
      }),
    ]);
  }

  async createPasswordResetToken(userId: string, token: string, expiresAt: Date) {
    return prisma.passwordResetToken.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    });
  }

  async findPasswordResetToken(token: string) {
    return prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });
  }

  async deletePasswordResetToken(tokenId: string) {
    return prisma.passwordResetToken.delete({
      where: { id: tokenId },
    });
  }

  async findUserDevice(userId: string, deviceHash: string) {
    return prisma.userDevice.findUnique({
      where: {
        userId_deviceHash: {
          userId,
          deviceHash,
        },
      },
    });
  }

  async createUserDevice(data: { userId: string; deviceHash: string; deviceName: string; ipAddress?: string }) {
    return prisma.userDevice.create({
      data,
    });
  }

  async updateUserDeviceLastLogin(userId: string, deviceHash: string, ipAddress?: string) {
    return prisma.userDevice.update({
      where: {
        userId_deviceHash: {
          userId,
          deviceHash,
        },
      },
      data: {
        ipAddress,
        lastLoginAt: new Date(),
      },
    });
  }

  async cleanupExpiredSessions(userId: string) {
    return prisma.refreshToken.deleteMany({
      where: {
        userId,
        expiresAt: { lte: new Date() },
      },
    });
  }

  async enforceSessionLimit(userId: string, maxSessions = 10) {
    const activeSessions = await prisma.refreshToken.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (activeSessions.length > maxSessions) {
      const idsToDelete = activeSessions.slice(maxSessions).map((s) => s.id);
      await prisma.refreshToken.deleteMany({
        where: {
          id: { in: idsToDelete },
          userId,
        },
      });
    }
  }

  async findSessionsByUserId(userId: string, query: { page: number; limit: number }) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;
    const now = new Date();
    const where = {
      userId,
      expiresAt: { gt: now },
    };

    const [sessions, total] = await prisma.$transaction([
      prisma.refreshToken.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.refreshToken.count({ where }),
    ]);

    return {
      data: sessions,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findSessionById(userId: string, sessionId: string) {
    return prisma.refreshToken.findFirst({
      where: { id: sessionId, userId },
    });
  }

  async deleteSessionById(userId: string, sessionId: string) {
    return prisma.refreshToken.deleteMany({
      where: { id: sessionId, userId },
    });
  }

  async deleteOtherSessions(userId: string, currentToken: string) {
    return prisma.refreshToken.deleteMany({
      where: {
        userId,
        NOT: {
          token: currentToken,
        },
      },
    });
  }
}

