import { AiRequestStatus, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import {
  AiRequestLogItemDto,
  AiRequestLogQueryDto,
  AiUsageSummaryDto,
} from './admin-ai.dto';

export class AdminAiRepository {
  async createLog(data: {
    userId?: string | null;
    feature: string;
    provider: string;
    model: string;
    status: AiRequestStatus;
    promptTokens?: number | null;
    completionTokens?: number | null;
    totalTokens?: number | null;
    latencyMs: number;
    errorMessage?: string | null;
  }) {
    return prisma.aiRequestLog.create({
      data: {
        userId: data.userId ?? null,
        feature: data.feature,
        provider: data.provider,
        model: data.model,
        status: data.status,
        promptTokens: data.promptTokens ?? null,
        completionTokens: data.completionTokens ?? null,
        totalTokens: data.totalTokens ?? null,
        latencyMs: Math.max(0, Math.round(data.latencyMs)),
        errorMessage: data.errorMessage ? data.errorMessage.slice(0, 500) : null,
      },
    });
  }

  async getUsageSummary(
    from: Date,
    to: Date,
    period: 'today' | 'week' | 'month',
  ): Promise<AiUsageSummaryDto> {
    const where: Prisma.AiRequestLogWhereInput = {
      createdAt: {
        gte: from,
        lte: to,
      },
    };

    const [
      aggregate,
      statusGrouped,
      featureGrouped,
    ] = await Promise.all([
      prisma.aiRequestLog.aggregate({
        where,
        _count: { _all: true },
        _avg: { latencyMs: true },
        _sum: {
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
        },
      }),
      prisma.aiRequestLog.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      prisma.aiRequestLog.groupBy({
        by: ['feature', 'status'],
        where,
        _count: { _all: true },
        _avg: { latencyMs: true },
        _sum: { totalTokens: true },
      }),
    ]);

    const totalRequests = aggregate._count._all;
    let successRequests = 0;
    let failedRequests = 0;
    let rateLimitEvents = 0;

    for (const group of statusGrouped) {
      if (group.status === AiRequestStatus.SUCCESS) {
        successRequests += group._count._all;
      } else if (group.status === AiRequestStatus.FAILED) {
        failedRequests += group._count._all;
      } else if (group.status === AiRequestStatus.RATE_LIMITED) {
        rateLimitEvents += group._count._all;
      }
    }

    const evaluatedRequests = successRequests + failedRequests;
    const successRate =
      evaluatedRequests > 0
        ? Math.round((successRequests / evaluatedRequests) * 1000) / 10
        : 100;

    const featureMap = new Map<
      string,
      { total: number; success: number; failed: number; totalLatency: number; latencyCount: number; totalTokens: number }
    >();

    for (const g of featureGrouped) {
      const current = featureMap.get(g.feature) ?? {
        total: 0,
        success: 0,
        failed: 0,
        totalLatency: 0,
        latencyCount: 0,
        totalTokens: 0,
      };

      const count = g._count._all;
      current.total += count;
      if (g.status === AiRequestStatus.SUCCESS) current.success += count;
      if (g.status === AiRequestStatus.FAILED) current.failed += count;
      if (g._avg.latencyMs) {
        current.totalLatency += g._avg.latencyMs * count;
        current.latencyCount += count;
      }
      if (g._sum.totalTokens) {
        current.totalTokens += g._sum.totalTokens;
      }
      featureMap.set(g.feature, current);
    }

    const byFeature = Array.from(featureMap.entries()).map(([feature, stats]) => ({
      feature,
      total: stats.total,
      success: stats.success,
      failed: stats.failed,
      avgLatencyMs:
        stats.latencyCount > 0
          ? Math.round(stats.totalLatency / stats.latencyCount)
          : 0,
      totalTokens: stats.totalTokens,
    }));

    return {
      period,
      totalRequests,
      successRequests,
      failedRequests,
      rateLimitEvents,
      successRate,
      avgLatencyMs: Math.round(aggregate._avg.latencyMs ?? 0),
      promptTokens: aggregate._sum.promptTokens ?? 0,
      completionTokens: aggregate._sum.completionTokens ?? 0,
      totalTokens: aggregate._sum.totalTokens ?? 0,
      isUsageAvailable: totalRequests > 0,
      byFeature,
    };
  }

  async findLogs(query: AiRequestLogQueryDto) {
    const {
      feature,
      status,
      userId,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20,
    } = query;

    const where: Prisma.AiRequestLogWhereInput = {
      ...(feature ? { feature } : {}),
      ...(status ? { status } : {}),
      ...(userId ? { userId } : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
    };

    const skip = (page - 1) * limit;

    const [logs, total] = await prisma.$transaction([
      prisma.aiRequestLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.aiRequestLog.count({ where }),
    ]);

    const formattedData: AiRequestLogItemDto[] = logs.map((log) => ({
      id: log.id,
      userId: log.userId,
      feature: log.feature,
      provider: log.provider,
      model: log.model,
      status: log.status,
      promptTokens: log.promptTokens,
      completionTokens: log.completionTokens,
      totalTokens: log.totalTokens,
      latencyMs: log.latencyMs,
      errorMessage: log.errorMessage,
      createdAt: log.createdAt,
    }));

    return {
      data: formattedData,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export const adminAiRepository = new AdminAiRepository();
