import {
  AnomalyEvaluationResultDto,
  AnomalyReasonCode,
  AnomalySeverity,
} from './anomaly.dto';

export interface AnomalyMathInput {
  amount: number;
  historicalCategoryAmounts: number[];
  recentWalletTxnCount: number;
  walletBalance: number;
  hourOfDayVietnam: number; // 0 to 23
}

export class AnomalyMathEngine {
  static evaluate(input: AnomalyMathInput): AnomalyEvaluationResultDto {
    const {
      amount,
      historicalCategoryAmounts,
      recentWalletTxnCount,
      walletBalance,
      hourOfDayVietnam,
    } = input;

    const reasonCodes: AnomalyReasonCode[] = [];
    let score = 0.0;
    const explanations: string[] = [];

    let categoryMedian = 0;
    let categoryMad = 0;
    let modifiedZScore = 0;

    const n = historicalCategoryAmounts.length;

    if (n >= 3) {
      categoryMedian = this.calculateMedian(historicalCategoryAmounts);
      const absDeviations = historicalCategoryAmounts.map((x) => Math.abs(x - categoryMedian));
      categoryMad = this.calculateMedian(absDeviations);

      const effectiveMad = Math.max(categoryMad, categoryMedian * 0.1, 10000);
      modifiedZScore = (0.6745 * (amount - categoryMedian)) / effectiveMad;

      if (modifiedZScore >= 3.5) {
        reasonCodes.push('SPIKE_VS_CATEGORY_MEDIAN');
        const factor = (amount / Math.max(1, categoryMedian)).toFixed(1);
        score += Math.min(0.85, 0.70 + (modifiedZScore - 3.5) * 0.03);
        explanations.push(`Chi tiêu cao gấp ${factor} lần mức trung vị thông thường (${categoryMedian.toLocaleString()} VND) của danh mục.`);
      }
    } else if (amount >= 5000000 || (walletBalance > 0 && amount >= walletBalance * 0.5)) {
      reasonCodes.push('FIRST_TIME_HIGH_VALUE');
      score += 0.55;
      explanations.push('Giao dịch giá trị lớn trong danh mục chưa có nhiều lịch sử chi tiêu.');
    }

    // Velocity Burst check
    if (recentWalletTxnCount >= 3) {
      reasonCodes.push('VELOCITY_BURST');
      score += 0.25;
      explanations.push(`Phát hiện ${recentWalletTxnCount} giao dịch diễn ra liên tiếp trong thời gian ngắn.`);
    }

    // Off-peak time check (2am to 5am)
    if (hourOfDayVietnam >= 2 && hourOfDayVietnam <= 5) {
      reasonCodes.push('OFF_PEAK_SURGE');
      score += 0.15;
      explanations.push('Giao dịch được tạo vào khung giờ đêm khuya (02:00 - 05:00).');
    }

    // High percentage of wallet check
    let walletPercent: number | null = null;
    if (walletBalance > 0) {
      walletPercent = (amount / walletBalance) * 100;
      if (walletPercent >= 60 && amount >= 1000000) {
        reasonCodes.push('HIGH_PERCENTAGE_OF_WALLET');
        score += 0.20;
        explanations.push(`Khoản chi chiếm ${walletPercent.toFixed(0)}% tổng số dư hiện tại của ví.`);
      }
    }

    // Clamp score to [0, 1]
    const finalScore = Math.min(1.0, Math.max(0.0, Math.round(score * 100) / 100));

    let severity: AnomalySeverity = 'NORMAL';
    if (finalScore >= 0.85) {
      severity = 'CRITICAL';
    } else if (finalScore >= 0.70) {
      severity = 'HIGH';
    } else if (finalScore >= 0.50) {
      severity = 'ELEVATED';
    }

    const isAnomaly = finalScore >= 0.70;
    const explanation = explanations.length > 0
      ? explanations.join(' ')
      : 'Giao dịch trong giới hạn chi tiêu bình thường.';

    return {
      isAnomaly,
      anomalyScore: finalScore,
      severity,
      reasonCodes,
      explanation,
      metrics: {
        categoryMedian: categoryMedian.toFixed(2),
        categoryMad: categoryMad.toFixed(2),
        modifiedZScore: Math.round(modifiedZScore * 100) / 100,
        recentWalletTxnCount,
        walletBalancePercent: walletPercent ? Math.round(walletPercent * 100) / 100 : null,
      },
    };
  }

  private static calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }
}
