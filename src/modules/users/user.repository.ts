import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import { UserQueryDto } from './user.dto';

export const userSelect = {
  id: true,
  email: true,
  fullName: true,
  avatarUrl: true,
  avatarPositionX: true,
  avatarPositionY: true,
  phoneNumber: true,
  roleId: true,
  isActive: true,
  deletedAt: true,
  deletedBy: true,
  createdAt: true,
  updatedAt: true,
  role: true,
} satisfies Prisma.UserSelect;

export class UserRepository {
  async findAll(query: UserQueryDto) {
    const {
      email,
      fullName,
      roleName,
      isActive,
      sortBy = 'createdAt',
      order = 'desc',
      page = 1,
      limit = 20,
    } = query;

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(email ? { email: { contains: email, mode: 'insensitive' } } : {}),
      ...(fullName ? { fullName: { contains: fullName, mode: 'insensitive' } } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(roleName ? { role: { name: roleName } } : {}),
    };

    const skip = (page - 1) * limit;

    const [data, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: { [sortBy]: order },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  findById(id: string) {
    return prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: userSelect,
    });
  }

  findDeletedById(id: string) {
    return prisma.user.findFirst({
      where: { id, deletedAt: { not: null } },
      select: userSelect,
    });
  }

  findByEmail(email: string) {
    return prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: userSelect,
    });
  }

  create(data: {
    email?: string;
    passwordHash?: string;
    fullName?: string;
    avatarUrl?: string;
    phoneNumber?: string;
    roleId: string;
    isActive?: boolean;
  }) {
    return prisma.user.create({
      data: {
        email: data.email,
        password: data.passwordHash,
        fullName: data.fullName,
        avatarUrl: data.avatarUrl,
        phoneNumber: data.phoneNumber,
        roleId: data.roleId,
        isActive: data.isActive,
      },
      select: userSelect,
    });
  }

  update(id: string, data: { isActive?: boolean; roleId?: string }) {
    return prisma.user.update({
      where: { id },
      data,
      select: userSelect,
    });
  }

  async softDelete(id: string, adminId: string) {
    return prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedBy: adminId,
          isActive: false,
        },
        select: userSelect,
      }),
      prisma.refreshToken.deleteMany({
        where: { userId: id },
      }),
    ]);
  }

  async restore(id: string) {
    return prisma.user.update({
      where: { id },
      data: {
        deletedAt: null,
        deletedBy: null,
        isActive: true,
      },
      select: userSelect,
    });
  }

  async getAdminStats() {
    const [totalUsers, activeUsers, inactiveUsers, deletedUsers, totalRoles] = await prisma.$transaction([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null, isActive: true } }),
      prisma.user.count({ where: { deletedAt: null, isActive: false } }),
      prisma.user.count({ where: { deletedAt: { not: null } } }),
      prisma.role.count(),
    ]);

    return {
      totalUsers,
      activeUsers,
      inactiveUsers,
      deletedUsers,
      totalRoles,
    };
  }
}
