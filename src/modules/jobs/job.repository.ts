import { prisma } from '../../database/prisma.client';
import { AsyncJob, AsyncJobStatus } from '@prisma/client';

export class JobRepository {
  async create(data: {
    userId: string;
    type: string;
    input?: any;
    maxAttempts?: number;
  }): Promise<AsyncJob> {
    return prisma.asyncJob.create({
      data: {
        userId: data.userId,
        type: data.type,
        input: data.input ?? {},
        status: AsyncJobStatus.PENDING,
        maxAttempts: data.maxAttempts ?? 3,
      },
    });
  }

  async findByIdAndUserId(id: string, userId: string): Promise<AsyncJob | null> {
    return prisma.asyncJob.findFirst({
      where: {
        id,
        userId,
      },
    });
  }

  async findByUserId(userId: string, limit = 20, skip = 0): Promise<AsyncJob[]> {
    return prisma.asyncJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip,
    });
  }

  async updateStatus(
    id: string,
    status: AsyncJobStatus,
    data?: {
      result?: any;
      error?: string;
      startedAt?: Date;
      completedAt?: Date;
    },
  ): Promise<AsyncJob> {
    return prisma.asyncJob.update({
      where: { id },
      data: {
        status,
        result: data?.result !== undefined ? data.result : undefined,
        error: data?.error !== undefined ? data.error : undefined,
        startedAt: data?.startedAt !== undefined ? data.startedAt : undefined,
        completedAt: data?.completedAt !== undefined ? data.completedAt : undefined,
      },
    });
  }
}
