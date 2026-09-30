import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import { businessDateToPrismaDate } from '../../common/date-time/business-time';
import { DebtAmortizationEngine } from './services/debt-amortization.engine';
import { DebtRepository } from './debt.repository';
import { WalletRepository } from '../wallets/wallet.repository';
import {
  CreateDebtContractDto,
  DebtContractQueryDto,
  PreviewAmortizationScheduleDto,
  UpdateDebtContractDto,
} from './debt.dto';

export class DebtService {
  private readonly repository = new DebtRepository();
  private readonly walletRepository = new WalletRepository();

  /**
   * Tính toán và trả về bảng lịch trả nợ dự kiến (không lưu DB)
   */
  public previewAmortization(dto: PreviewAmortizationScheduleDto) {
    return DebtAmortizationEngine.calculate(dto.method, {
      principal: dto.principal,
      annualInterestRate: dto.annualInterestRate,
      termMonths: dto.termMonths,
      startDate: dto.startDate,
    });
  }

  /**
   * Tạo mới hợp đồng nợ và sinh tự động toàn bộ bảng lịch trả nợ
   */
  public async create(userId: string, dto: CreateDebtContractDto) {
    if (dto.walletId) {
      const wallet = await this.walletRepository.findById(userId, dto.walletId);
      if (!wallet || wallet.isArchived) {
        throw new AppError('Ví thanh toán không tồn tại hoặc đã bị lưu trữ', 400, ERROR_CODE.WALLET_ARCHIVED);
      }
    }

    // 1. Tính toán bảng lịch trả nợ qua Pure Math Engine
    const scheduleResult = DebtAmortizationEngine.calculate(dto.method, {
      principal: dto.principal,
      annualInterestRate: dto.annualInterestRate,
      termMonths: dto.termMonths,
      startDate: dto.startDate,
    });

    const lastInstallment = scheduleResult.installments[scheduleResult.installments.length - 1];
    const endDate = lastInstallment ? businessDateToPrismaDate(lastInstallment.dueDate) : null;

    // 2. Chuẩn bị dữ liệu Hợp đồng nợ
    const contractData: Prisma.DebtContractUncheckedCreateInput = {
      userId,
      walletId: dto.walletId || null,
      name: dto.name,
      counterparty: dto.counterparty,
      type: dto.type,
      method: dto.method,
      status: 'ACTIVE',
      principal: new Prisma.Decimal(dto.principal),
      remainingPrincipal: new Prisma.Decimal(dto.principal),
      annualInterestRate: new Prisma.Decimal(dto.annualInterestRate),
      termMonths: dto.termMonths,
      startDate: businessDateToPrismaDate(dto.startDate),
      endDate,
      notes: dto.notes || null,
      isArchived: false,
    };

    // 3. Chuẩn bị dữ liệu các kỳ thanh toán
    const scheduleItemsData: Omit<Prisma.DebtScheduleItemUncheckedCreateInput, 'debtContractId'>[] =
      scheduleResult.installments.map((item) => ({
        userId,
        period: item.period,
        dueDate: businessDateToPrismaDate(item.dueDate),
        principalDue: new Prisma.Decimal(item.principalDue),
        interestDue: new Prisma.Decimal(item.interestDue),
        totalDue: new Prisma.Decimal(item.totalDue),
        principalPaid: new Prisma.Decimal(0),
        interestPaid: new Prisma.Decimal(0),
        remainingPrincipal: new Prisma.Decimal(item.remainingPrincipal),
        status: 'SCHEDULED',
      }));

    // 4. Lưu nguyên tử vào database
    return this.repository.createWithSchedule(contractData, scheduleItemsData);
  }

  /**
   * Lấy danh sách hợp đồng nợ kèm tổng quan tài chính
   */
  public async findAll(userId: string, query: DebtContractQueryDto) {
    const [result, summary] = await Promise.all([
      this.repository.findAll(userId, query),
      this.repository.getSummary(userId),
    ]);

    return {
      ...result,
      summary,
    };
  }

  /**
   * Xem chi tiết một hợp đồng nợ kèm các chỉ số tiến độ
   */
  public async findById(id: string, userId: string) {
    const contract = await this.repository.findById(id, userId);
    if (!contract || contract.isArchived) {
      throw new AppError('Khoản nợ không tồn tại hoặc đã bị lưu trữ', 404, ERROR_CODE.DEBT_NOT_FOUND);
    }

    const totalInstallments = contract.scheduleItems.length;
    const paidInstallments = contract.scheduleItems.filter((i) => i.status === 'PAID').length;

    let totalPaidPrincipal = new Prisma.Decimal(0);
    let totalPaidInterest = new Prisma.Decimal(0);

    for (const item of contract.scheduleItems) {
      totalPaidPrincipal = totalPaidPrincipal.add(item.principalPaid);
      totalPaidInterest = totalPaidInterest.add(item.interestPaid);
    }

    const nextUpcoming = contract.scheduleItems.find((i) =>
      ['SCHEDULED', 'UPCOMING', 'DUE', 'OVERDUE'].includes(i.status),
    );

    return {
      ...contract,
      metrics: {
        totalInstallments,
        paidInstallments,
        progressPercent: totalInstallments > 0 ? Math.round((paidInstallments / totalInstallments) * 100) : 0,
        totalPaidPrincipal: totalPaidPrincipal.toNumber(),
        totalPaidInterest: totalPaidInterest.toNumber(),
        remainingPrincipal: contract.remainingPrincipal.toNumber(),
        nextDueDate: nextUpcoming ? nextUpcoming.dueDate : null,
        nextDueAmount: nextUpcoming ? nextUpcoming.totalDue.toNumber() : 0,
      },
    };
  }

  /**
   * Cập nhật thông tin mô tả / ví của hợp đồng nợ
   */
  public async update(id: string, userId: string, dto: UpdateDebtContractDto) {
    await this.findById(id, userId);

    if (dto.walletId) {
      const wallet = await this.walletRepository.findById(userId, dto.walletId);
      if (!wallet || wallet.isArchived) {
        throw new AppError('Ví thanh toán không tồn tại hoặc đã bị lưu trữ', 400, ERROR_CODE.WALLET_ARCHIVED);
      }
    }

    await this.repository.update(id, userId, dto);
    return this.findById(id, userId);
  }

  /**
   * Lưu trữ (Soft-delete / Archive) hợp đồng nợ
   */
  public async archive(id: string, userId: string) {
    await this.findById(id, userId);
    await this.repository.archive(id, userId);
    return { success: true, message: 'Đã lưu trữ khoản nợ thành công' };
  }
}
