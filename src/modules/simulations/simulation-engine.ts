import { Prisma } from '@prisma/client';
import {
  GoalImpactDto,
  MonthlyComparisonPointDto,
  PerturbationDto,
  SimulationResultDto,
  SimulationRiskAssessment,
} from './simulation.dto';

export interface SimulationBaselineInput {
  startingBalance: Prisma.Decimal;
  dailyIncome: number;
  dailyExpense: number;
  categoryDailyExpenses: Map<string, number>;
  savingGoals: {
    id: string;
    name: string;
    targetAmount: Prisma.Decimal;
    savedAmount: Prisma.Decimal;
    targetDate: string; // YYYY-MM-DD
  }[];
  startYear: number;
  startMonth: number; // 1-12
}

export class SimulationEngine {
  static run(
    baseline: SimulationBaselineInput,
    perturbations: PerturbationDto[],
    horizonMonths: number,
    currency: string,
  ): SimulationResultDto {
    const daysInMonthAvg = 30.4375;
    const baseMonthlyIncome = baseline.dailyIncome * daysInMonthAvg;
    const baseMonthlyExpense = baseline.dailyExpense * daysInMonthAvg;

    const startingBalanceNum = baseline.startingBalance.toNumber();

    let currentBaseBalance = startingBalanceNum;
    let currentSimBalance = startingBalanceNum;

    const monthlyComparison: MonthlyComparisonPointDto[] = [];
    let minSimBalance = currentSimBalance;
    let minSimMonth = 1;

    for (let m = 1; m <= horizonMonths; m++) {
      const monthDate = this.formatMonthDate(baseline.startYear, baseline.startMonth, m);

      // Baseline monthly flow
      const baseNetFlow = baseMonthlyIncome - baseMonthlyExpense;
      currentBaseBalance += baseNetFlow;

      // Simulated monthly flow
      let simIncome = baseMonthlyIncome;
      let simExpense = baseMonthlyExpense;

      for (const p of perturbations) {
        const amountNum = p.amount ? parseFloat(p.amount) : 0;

        if (p.type === 'RECURRING_EXPENSE') {
          const start = p.startMonth ?? 1;
          const duration = p.durationMonths ?? horizonMonths;
          if (m >= start && m < start + duration) {
            simExpense += amountNum;
          }
        } else if (p.type === 'RECURRING_INCOME') {
          const start = p.startMonth ?? 1;
          const duration = p.durationMonths ?? horizonMonths;
          if (m >= start && m < start + duration) {
            simIncome += amountNum;
          }
        } else if (p.type === 'ONE_OFF_EXPENSE') {
          const target = p.targetMonth ?? 1;
          if (m === target) {
            simExpense += amountNum;
          }
        } else if (p.type === 'ONE_OFF_INCOME') {
          const target = p.targetMonth ?? 1;
          if (m === target) {
            simIncome += amountNum;
          }
        } else if (p.type === 'CATEGORY_ADJUSTMENT' && p.categoryId && p.percentageDelta !== undefined) {
          const catDaily = baseline.categoryDailyExpenses.get(p.categoryId) ?? 0;
          const catMonthly = catDaily * daysInMonthAvg;
          const adjustment = catMonthly * (p.percentageDelta / 100);
          simExpense += adjustment; // e.g. -20% reduces expense
        }
      }

      const simNetFlow = simIncome - simExpense;
      currentSimBalance += simNetFlow;

      if (currentSimBalance < minSimBalance) {
        minSimBalance = currentSimBalance;
        minSimMonth = m;
      }

      monthlyComparison.push({
        monthIndex: m,
        monthDate,
        baselineBalance: currentBaseBalance.toFixed(2),
        simulatedBalance: currentSimBalance.toFixed(2),
        monthlyDelta: (currentSimBalance - currentBaseBalance).toFixed(2),
        baselineNetFlow: baseNetFlow.toFixed(2),
        simulatedNetFlow: simNetFlow.toFixed(2),
      });
    }

    const netDeltaNum = currentSimBalance - currentBaseBalance;
    const isDeficitProjected = minSimBalance < 0;

    let riskAssessment: SimulationRiskAssessment = 'LOW_IMPACT';
    if (isDeficitProjected) {
      riskAssessment = 'HIGH_DEFICIT_RISK';
    } else if (netDeltaNum < -0.15 * Math.max(1, startingBalanceNum)) {
      riskAssessment = 'MODERATE_IMPACT';
    }

    // Evaluate Goal Impacts
    const goalImpacts: GoalImpactDto[] = baseline.savingGoals.map((goal) => {
      const targetAmountNum = goal.targetAmount.toNumber();
      const currentSavedNum = goal.savedAmount.toNumber();
      const remainingTarget = Math.max(0, targetAmountNum - currentSavedNum);

      // Assume 20% of net positive cash flow is allocated towards goal
      const baseMonthlyAlloc = Math.max(0, (baseMonthlyIncome - baseMonthlyExpense) * 0.2);
      const simAvgNet = Math.max(
        0,
        (currentSimBalance - startingBalanceNum) / Math.max(1, horizonMonths) * 0.2,
      );

      const baseMonthsNeeded = baseMonthlyAlloc > 0 ? Math.ceil(remainingTarget / baseMonthlyAlloc) : null;
      const simMonthsNeeded = simAvgNet > 0 ? Math.ceil(remainingTarget / simAvgNet) : null;

      let delayMonths: number | null = null;
      let status: GoalImpactDto['status'] = 'ON_TRACK';

      if (baseMonthsNeeded !== null && simMonthsNeeded !== null) {
        delayMonths = simMonthsNeeded - baseMonthsNeeded;
        if (delayMonths > 0) {
          status = 'DELAYED';
        } else if (delayMonths < 0) {
          status = 'ACCELERATED';
        }
      } else if (simMonthsNeeded === null && remainingTarget > 0) {
        status = 'UNACHIEVABLE';
      }

      const baselineEstimatedMonth = baseMonthsNeeded
        ? this.formatMonthDate(baseline.startYear, baseline.startMonth, baseMonthsNeeded)
        : null;

      const simulatedEstimatedMonth = simMonthsNeeded
        ? this.formatMonthDate(baseline.startYear, baseline.startMonth, simMonthsNeeded)
        : null;

      return {
        goalId: goal.id,
        goalName: goal.name,
        targetAmount: goal.targetAmount.toFixed(2),
        currentSaved: goal.savedAmount.toFixed(2),
        targetDate: goal.targetDate,
        baselineEstimatedMonth,
        simulatedEstimatedMonth,
        delayMonths,
        status,
      };
    });

    return {
      currency,
      horizonMonths,
      startingBalance: baseline.startingBalance.toFixed(2),
      summary: {
        baselineEndBalance: currentBaseBalance.toFixed(2),
        simulatedEndBalance: currentSimBalance.toFixed(2),
        netDelta: netDeltaNum.toFixed(2),
        minimumSimulatedBalance: minSimBalance.toFixed(2),
        minimumBalanceMonth: minSimMonth,
        isDeficitProjected,
        riskAssessment,
      },
      monthlyComparison,
      goalImpacts,
    };
  }

  private static formatMonthDate(startYear: number, startMonth: number, offsetMonths: number): string {
    const totalMonths = startYear * 12 + (startMonth - 1) + offsetMonths;
    const year = Math.floor(totalMonths / 12);
    const month = (totalMonths % 12) + 1;
    return `${year}-${String(month).padStart(2, '0')}`;
  }
}
