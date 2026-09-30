import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import { DebtContractQueryDto, UpdateDebtContractDto } from './debt.dto';

export class DebtRepository {
  /**
   * Tạo hợp đồng nợ và toàn bộ các kỳ trong bảng lịch trả nợ trong một Transaction nguyên tử
   */
  async createWithSchedule(
    contractData: Prisma.DebtContractUncheckedCreateInput,
    scheduleItems: Omit<Prisma.DebtScheduleItemUncheckedCreateInput, 'debtContractId'>[],
  ) {
    return prisma.$transaction(async (tx) => {
      const contract = await tx.debtContract.create({
        data: contractData,
      });

      const scheduleData = scheduleItems.map((item) => ({
        ...item,
        debtContractId: contract.id,
      }));

      await tx.debtScheduleItem.createMany({
        data: scheduleData,
      });

      return tx.debtContract.findUnique({
        where: { id: contract.id },
        include: {
          wallet: {
            select: { id: true, name: true, currency: true },
          },
          scheduleItems: {
            orderBy: { period: 'asc' },
          },
        },
      });
    });
  }

  /**
   * Lấy danh sách hợp đồng nợ kèm phân trang và bộ lọc
   */
  async findAll(userId: string, query: DebtContractQueryDto) {
    const { type, status, isArchived = false, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.DebtContractWhereInput = {
      userId,
      isArchived,
      ...(type && { type }),
      ...(status && { status }),
    };

    const [total, items] = await Promise.all([
      prisma.debtContract.count({ where }),
      prisma.debtContract.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          wallet: {
            select: { id: true, name: true, currency: true },
          },
          _count: {
            select: { scheduleItems: true },
          },
        },
      }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Tìm chi tiết một hợp đồng nợ theo ID và userId
   */
  async findById(id: string, userId: string) {
    return prisma.debtContract.findFirst({
      where: { id, userId },
      include: {
        wallet: {
          select: { id: true, name: true, currency: true, balance: true },
        },
        scheduleItems: {
          orderBy: { period: 'asc' },
        },
      },
    });
  }

  /**
   * Cập nhật thông tin mô tả / ví của hợp đồng nợ
   */
  async update(id: string, userId: string, data: UpdateDebtContractDto) {
    return prisma.debtContract.updateMany({
      where: { id, userId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.counterparty && { counterparty: data.counterparty }),
        ...(data.walletId !== undefined && { walletId: data.walletId }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    });
  }

  /**
   * Lưu trữ (Soft Delete / Archive) hợp đồng nợ
   */
  async archive(id: string, userId: string) {
    return prisma.debtContract.updateMany({
      where: { id, userId },
      data: {
        isArchived: true,
        status: 'CANCELLED',
      },
    });
  }

  /**
   * Lấy tổng quan số dư nợ phải trả và cho vay của người dùng
   */
  async getSummary(userId: string) {
    const activeContracts = await prisma.debtContract.findMany({
      where: {
        userId,
        isArchived: false,
        status: { in: ['ACTIVE', 'OVERDUE'] },
      },
      select: {
        type: true,
        remainingPrincipal: true,
      },
    });

    let totalBorrowing = new Prisma.Decimal(0);
    let totalLending = new Prisma.Decimal(0);

    for (const contract of activeContracts) {
      if (contract.type === 'DEBT_PAYABLE') {
        totalBorrowing = totalBorrowing.add(contract.remainingPrincipal);
      } else {
        totalLending = totalLending.add(contract.remainingPrincipal);
      }
    }

    return {
      totalBorrowing: totalBorrowing.toNumber(),
      totalLending: totalLending.toNumber(),
    };
  }
}
