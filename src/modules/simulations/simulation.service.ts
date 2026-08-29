import { Prisma, TransactionType } from '@prisma/client';
import { prisma } from '../../database/prisma.client';
import {
  businessWallTimeToInstant,
  instantToBusinessDate,
  prismaDateToBusinessDate,
} from '../../common/date-time/business-time';
import {
  RunSimulationInputDto,
  SimulationPresetDto,
  SimulationResultDto,
} from './simulation.dto';
import { SimulationBaselineInput, SimulationEngine } from './simulation-engine';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const BASELINE_WINDOW_DAYS = 90;

export class SimulationService {
  async runSimulation(
    userId: string,
    input: RunSimulationInputDto,
  ): Promise<SimulationResultDto> {
    const now = new Date();
    const asOfDate = instantToBusinessDate(now);
    const [currentYear, currentMonth] = asOfDate.split('-').map(Number);

    // 1. Wallets & Starting Balance
    const wallets = await prisma.wallet.findMany({
      where: {
        userId,
        isArchived: false,
        ...(input.currency ? { currency: input.currency } : {}),
      },
      select: {
        balance: true,
        currency: true,
      },
    });

    const targetCurrency = input.currency
      ?? (wallets.length > 0 ? wallets[0].currency : 'VND');

    const targetWallets = wallets.filter((w) => w.currency === targetCurrency);
    const startingBalance = targetWallets.reduce(
      (sum, w) => sum.plus(w.balance),
      new Prisma.Decimal(0),
    );

    // 2. 90-day Historical Cash Flow
    const fromBoundary = new Date(now.getTime() - BASELINE_WINDOW_DAYS * MILLISECONDS_PER_DAY);
    const toBoundary = businessWallTimeToInstant(asOfDate);

    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        wallet: { currency: targetCurrency },
        date: {
          gte: fromBoundary,
          lt: new Date(toBoundary.getTime() + MILLISECONDS_PER_DAY),
        },
      },
      select: {
        amount: true,
        type: true,
        categoryId: true,
      },
    });

    let totalIncome = 0;
    let totalExpense = 0;
    const categoryTotals = new Map<string, number>();

    transactions.forEach((tx) => {
      const amt = tx.amount.toNumber();
      if (tx.type === TransactionType.INCOME) {
        totalIncome += amt;
      } else {
        totalExpense += amt;
        const currentCat = categoryTotals.get(tx.categoryId) ?? 0;
        categoryTotals.set(tx.categoryId, currentCat + amt);
      }
    });

    const dailyIncome = totalIncome / BASELINE_WINDOW_DAYS;
    const dailyExpense = totalExpense / BASELINE_WINDOW_DAYS;

    const categoryDailyExpenses = new Map<string, number>();
    categoryTotals.forEach((val, catId) => {
      categoryDailyExpenses.set(catId, val / BASELINE_WINDOW_DAYS);
    });

    // 3. Active Saving Goals with lifetime contributions
    const goals = await prisma.savingGoal.findMany({
      where: {
        userId,
        isArchived: false,
        status: 'ACTIVE',
        currency: targetCurrency,
      },
      include: {
        contributions: {
          select: {
            amount: true,
          },
        },
      },
    });

    const savingGoals = goals.map((goal) => {
      const savedAmount = goal.contributions.reduce(
        (sum, c) => sum.plus(c.amount),
        new Prisma.Decimal(0),
      );
      return {
        id: goal.id,
        name: goal.name,
        targetAmount: goal.targetAmount,
        savedAmount,
        targetDate: prismaDateToBusinessDate(goal.targetDate),
      };
    });

    const baseline: SimulationBaselineInput = {
      startingBalance,
      dailyIncome,
      dailyExpense,
      categoryDailyExpenses,
      savingGoals,
      startYear: currentYear,
      startMonth: currentMonth,
    };

    return SimulationEngine.run(
      baseline,
      input.perturbations,
      input.horizonMonths ?? 12,
      targetCurrency,
    );
  }

  getPresets(): SimulationPresetDto[] {
    return [
      {
        id: 'installment-loan',
        title: 'Mua hàng trả góp',
        description: 'Mô phỏng khoản thanh toán trả góp hàng tháng (VD: mua điện thoại, xe máy)',
        perturbations: [
          {
            type: 'RECURRING_EXPENSE',
            name: 'Khoản trả góp',
            amount: '3000000.00',
            startMonth: 1,
            durationMonths: 6,
          },
        ],
      },
      {
        id: 'salary-increase',
        title: 'Tăng thu nhập định kỳ',
        description: 'Mô phỏng khi được tăng lương hoặc có thêm nguồn thu nhập phụ',
        perturbations: [
          {
            type: 'RECURRING_INCOME',
            name: 'Tăng lương',
            amount: '5000000.00',
            startMonth: 1,
            durationMonths: 12,
          },
        ],
      },
      {
        id: 'frugal-budget-cut',
        title: 'Thắt chặt chi tiêu',
        description: 'Giảm 20% chi tiêu cho các danh mục không thiết yếu',
        perturbations: [
          {
            type: 'CATEGORY_ADJUSTMENT',
            name: 'Cắt giảm chi tiêu',
            percentageDelta: -20,
          },
        ],
      },
      {
        id: 'one-time-purchase',
        title: 'Khoản chi lớn đột xuất',
        description: 'Mô phỏng khoản chi tiêu một lần trong các tháng tới (VD: du lịch, đóng học phí)',
        perturbations: [
          {
            type: 'ONE_OFF_EXPENSE',
            name: 'Chi phí lớn',
            amount: '15000000.00',
            targetMonth: 3,
          },
        ],
      },
    ];
  }
}
