import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import { systemSettingService } from '../system-settings/system-setting.service';
import {
  AnomalyEvaluationResultDto,
  EvaluateAnomalyInputDto,
  FlaggedAnomalyTransactionDto,
} from './anomaly.dto';
import { AnomalyMathEngine } from './anomaly-math';
import { AnomalyRepository } from './anomaly.repository';

export class AnomalyService {
  private readonly repository = new AnomalyRepository();

  private async ensureAnomaliesEnabled() {
    const enabled = await systemSettingService.getBoolean('ai.anomalies.enabled', true);
    if (!enabled) {
      throw new AppError(
        'Tính năng Phát hiện chi tiêu bất thường đang tạm thời bị vô hiệu hóa bởi quản trị viên',
        403,
        ERROR_CODE.FORBIDDEN,
      );
    }
  }

  async evaluateTransaction(
    userId: string,
    input: EvaluateAnomalyInputDto,
  ): Promise<AnomalyEvaluationResultDto> {
    await this.ensureAnomaliesEnabled();
    const parsedAmount = parseFloat(input.amount);
    const amountNum = Number.isFinite(parsedAmount) ? Math.max(0, parsedAmount) : 0;

    const dateObj = input.occurredAt ?? new Date();

    // Vietnam timezone hour (UTC+7)
    const hourOfDayVietnam = (dateObj.getUTCHours() + 7) % 24;

    const [categoryHistory, recentTxnCount, walletBalance] = await Promise.all([
      this.repository.getCategoryHistory(
        userId,
        input.categoryId,
        input.transactionId,
      ),
      this.repository.getRecentWalletTxnCount(
        userId,
        input.walletId,
        20,
        input.transactionId,
      ),
      this.repository.getWalletBalance(userId, input.walletId),
    ]);

    return AnomalyMathEngine.evaluate({
      amount: amountNum,
      historicalCategoryAmounts: categoryHistory,
      recentWalletTxnCount: recentTxnCount,
      walletBalance,
      hourOfDayVietnam,
    });
  }

  async getRecentAnomalies(userId: string): Promise<FlaggedAnomalyTransactionDto[]> {
    await this.ensureAnomaliesEnabled();
    const transactions = await this.repository.getRecentExpenseTransactions(userId, 40);

    if (transactions.length === 0) {
      return [];
    }

    const uniqueCategoryIds = [...new Set(transactions.map((t) => t.categoryId))];
    const uniqueWalletIds = [...new Set(transactions.map((t) => t.walletId))];

    const [categoryHistoryMap, walletBalanceMap] = await Promise.all([
      this.repository.getBatchCategoryHistories(userId, uniqueCategoryIds),
      this.repository.getBatchWalletBalances(userId, uniqueWalletIds),
    ]);

    const flagged: FlaggedAnomalyTransactionDto[] = [];

    for (const tx of transactions) {
      const parsedAmount = parseFloat(tx.amount);
      const amountNum = Number.isFinite(parsedAmount) ? Math.max(0, parsedAmount) : 0;
      const dateObj = tx.createdAt ? new Date(tx.createdAt) : new Date();
      const hourOfDayVietnam = (dateObj.getUTCHours() + 7) % 24;

      const historyList = categoryHistoryMap.get(tx.categoryId) || [];
      const historicalCategoryAmounts = historyList
        .filter((h) => h.id !== tx.id)
        .map((h) => h.amount);

      const walletBalance = walletBalanceMap.get(tx.walletId) ?? 0;

      const evaluation = AnomalyMathEngine.evaluate({
        amount: amountNum,
        historicalCategoryAmounts,
        recentWalletTxnCount: 1, // baseline within batch
        walletBalance,
        hourOfDayVietnam,
      });

      if (evaluation.isAnomaly) {
        flagged.push({
          transactionId: tx.id,
          amount: tx.amount,
          currency: tx.currency,
          categoryName: tx.categoryName,
          walletName: tx.walletName,
          date: tx.date,
          anomalyScore: evaluation.anomalyScore,
          reasonCodes: evaluation.reasonCodes,
          explanation: evaluation.explanation,
        });
      }
    }

    return flagged;
  }
}
