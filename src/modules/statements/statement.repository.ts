import { prisma } from '../../database/prisma.client';
import { StatementExportFormat, StatementJobStatus, Prisma } from '@prisma/client';

export class StatementRepository {
  async create(data: {
    userId: string;
    walletId?: string;
    format: StatementExportFormat;
    dateFrom: Date;
    dateTo: Date;
    isPasswordProtected: boolean;
    passwordHint?: string;
    verificationCode: string;
  }) {
    return prisma.statementJob.create({
      data: {
        userId: data.userId,
        walletId: data.walletId,
        format: data.format,
        dateFrom: data.dateFrom,
        dateTo: data.dateTo,
        isPasswordProtected: data.isPasswordProtected,
        passwordHint: data.passwordHint,
        verificationCode: data.verificationCode,
      },
    });
  }

  async findByIdAndUserId(id: string, userId: string) {
    return prisma.statementJob.findFirst({
      where: { id, userId },
      include: { wallet: { select: { id: true, name: true } } },
    });
  }

  async findByVerificationCode(code: string) {
    return prisma.statementJob.findUnique({
      where: { verificationCode: code },
      include: {
        user: { select: { id: true, fullName: true } },
        wallet: { select: { id: true, name: true } },
      },
    });
  }

  async findManyByUserId(
    userId: string,
    page: number,
    limit: number,
  ) {
    const skip = (page - 1) * limit;
    const [jobs, total] = await prisma.$transaction([
      prisma.statementJob.findMany({
        where: { userId },
        include: { wallet: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.statementJob.count({ where: { userId } }),
    ]);
    return { jobs, total };
  }

  async updateStatus(
    id: string,
    status: StatementJobStatus,
    data?: {
      startedAt?: Date;
      completedAt?: Date;
      fileUrl?: string;
      fileKey?: string;
      fileSize?: number;
      recordCount?: number;
      expiresAt?: Date;
      error?: string;
    },
  ) {
    const updateData: Prisma.StatementJobUpdateInput = { status };
    if (data?.startedAt !== undefined) updateData.startedAt = data.startedAt;
    if (data?.completedAt !== undefined) updateData.completedAt = data.completedAt;
    if (data?.fileUrl !== undefined) updateData.fileUrl = data.fileUrl;
    if (data?.fileKey !== undefined) updateData.fileKey = data.fileKey;
    if (data?.fileSize !== undefined) updateData.fileSize = data.fileSize;
    if (data?.recordCount !== undefined) updateData.recordCount = data.recordCount;
    if (data?.expiresAt !== undefined) updateData.expiresAt = data.expiresAt;
    if (data?.error !== undefined) updateData.error = data.error;

    return prisma.statementJob.update({ where: { id }, data: updateData });
  }
}
