export type PerturbationType =
  | 'RECURRING_EXPENSE'
  | 'RECURRING_INCOME'
  | 'ONE_OFF_EXPENSE'
  | 'ONE_OFF_INCOME'
  | 'CATEGORY_ADJUSTMENT';

export type GoalImpactStatus = 'ON_TRACK' | 'ACCELERATED' | 'DELAYED' | 'UNACHIEVABLE';

export type SimulationRiskAssessment = 'LOW_IMPACT' | 'MODERATE_IMPACT' | 'HIGH_DEFICIT_RISK';

export interface PerturbationDto {
  type: PerturbationType;
  name: string;
  amount?: string;
  percentageDelta?: number; // e.g. -20 for 20% reduction
  categoryId?: string;
  startMonth?: number; // 1-indexed relative to horizon
  durationMonths?: number; // for recurring
  targetMonth?: number; // for one-off
}

export interface RunSimulationInputDto {
  currency?: string;
  horizonMonths?: number; // default 12, min 3, max 36
  perturbations: PerturbationDto[];
}

export interface MonthlyComparisonPointDto {
  monthIndex: number;
  monthDate: string; // YYYY-MM
  baselineBalance: string;
  simulatedBalance: string;
  monthlyDelta: string;
  baselineNetFlow: string;
  simulatedNetFlow: string;
}

export interface GoalImpactDto {
  goalId: string;
  goalName: string;
  targetAmount: string;
  currentSaved: string;
  targetDate: string;
  baselineEstimatedMonth: string | null;
  simulatedEstimatedMonth: string | null;
  delayMonths: number | null;
  status: GoalImpactStatus;
}

export interface SimulationSummaryDto {
  baselineEndBalance: string;
  simulatedEndBalance: string;
  netDelta: string;
  minimumSimulatedBalance: string;
  minimumBalanceMonth: number;
  isDeficitProjected: boolean;
  riskAssessment: SimulationRiskAssessment;
}

export interface SimulationResultDto {
  currency: string;
  horizonMonths: number;
  startingBalance: string;
  summary: SimulationSummaryDto;
  monthlyComparison: MonthlyComparisonPointDto[];
  goalImpacts: GoalImpactDto[];
}

export interface SimulationPresetDto {
  id: string;
  title: string;
  description: string;
  perturbations: PerturbationDto[];
}
