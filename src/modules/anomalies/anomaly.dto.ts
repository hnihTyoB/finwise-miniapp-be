export type AnomalyReasonCode =
  | 'SPIKE_VS_CATEGORY_MEDIAN'
  | 'VELOCITY_BURST'
  | 'OFF_PEAK_SURGE'
  | 'HIGH_PERCENTAGE_OF_WALLET'
  | 'FIRST_TIME_HIGH_VALUE';

export type AnomalySeverity = 'NORMAL' | 'ELEVATED' | 'HIGH' | 'CRITICAL';

export interface EvaluateAnomalyInputDto {
  transactionId?: string;
  walletId: string;
  categoryId: string;
  amount: string;
  type: string;
  occurredAt?: Date;
}

export interface AnomalyEvaluationResultDto {
  isAnomaly: boolean;
  anomalyScore: number; // 0.00 to 1.00
  severity: AnomalySeverity;
  reasonCodes: AnomalyReasonCode[];
  explanation: string;
  metrics: {
    categoryMedian: string;
    categoryMad: string;
    modifiedZScore: number;
    recentWalletTxnCount: number;
    walletBalancePercent: number | null;
  };
}

export interface FlaggedAnomalyTransactionDto {
  transactionId: string;
  amount: string;
  currency: string;
  categoryName: string;
  walletName: string;
  date: string;
  anomalyScore: number;
  reasonCodes: AnomalyReasonCode[];
  explanation: string;
}
