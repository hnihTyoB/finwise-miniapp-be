import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import { cacheService } from '../../common/services/cache.service';
import { systemSettingService } from '../system-settings/system-setting.service';
import {
  businessWallTimeToInstant,
  instantToBusinessDate,
} from '../../common/date-time/business-time';
import {
  BudgetDepletionReportDto,
  ForecastQueryDto,
  ForecastRunwayDto,
} from './forecast.dto';
import { ForecastMathEngine } from './forecast-math';
import { ForecastRepository } from './forecast.repository';

const DEFAULT_HORIZON_DAYS = 30;
const HISTORICAL_WINDOW_DAYS = 90;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const CACHE_TTL_SECONDS = 300; // 5 minutes

export class ForecastService {
  private readonly repository = new ForecastRepository();

  private async ensureForecastingEnabled() {
    const enabled = await systemSettingService.getBoolean('ai.forecasting.enabled', true);
    if (!enabled) {
      throw new AppError(
        'Tính năng Dự báo dòng tiền đang tạm thời bị vô hiệu hóa bởi quản trị viên',
        403,
        ERROR_CODE.FORBIDDEN,
      );
    }
  }

  async getRunway(userId: string, query: ForecastQueryDto): Promise<ForecastRunwayDto> {
    await this.ensureForecastingEnabled();
    const cacheKey = `finwise:cache:forecast:${userId}:runway:${JSON.stringify(query)}`;

    const cached = await cacheService.get<ForecastRunwayDto>(cacheKey);
    if (cached) {
      return cached;
    }

    const horizonDays = query.horizonDays ?? DEFAULT_HORIZON_DAYS;
    const now = new Date();
    const asOfDate = instantToBusinessDate(now);

    const wallets = await this.repository.findWallets(
      userId,
      query.walletId,
      query.currency,
    );

    if (query.walletId && wallets.length === 0) {
      throw new AppError('Wallet not found or archived', 404, ERROR_CODE.NOT_FOUND);
    }

    // Determine target currency
    const targetCurrency = query.currency
      ?? (wallets.length > 0 ? wallets[0].currency : 'VND');

    // Aggregate starting balance for all matching active wallets with target currency
    const targetWallets = wallets.filter((w) => w.currency === targetCurrency);
    const initialBalance = targetWallets.reduce(
      (sum, wallet) => sum.plus(wallet.balance),
      new Prisma.Decimal(0),
    );

    // Historical window: [now - 90 days, now)
    const historyFromInstant = new Date(now.getTime() - HISTORICAL_WINDOW_DAYS * MILLISECONDS_PER_DAY);
    const historyFromDate = instantToBusinessDate(historyFromInstant);
    const fromBoundary = businessWallTimeToInstant(historyFromDate);
    const toBoundary = businessWallTimeToInstant(asOfDate);

    const { dailyBuckets, totalTransactionCount } = await this.repository.findHistoricalDailyBuckets(
      userId,
      fromBoundary,
      new Date(toBoundary.getTime() + MILLISECONDS_PER_DAY),
      query.walletId,
      targetCurrency,
    );

    const forecastResult = ForecastMathEngine.computeRunway(
      initialBalance,
      dailyBuckets,
      horizonDays,
      asOfDate,
      totalTransactionCount,
    );

    const result: ForecastRunwayDto = {
      currency: targetCurrency,
      walletId: query.walletId ?? null,
      currentBalance: initialBalance.toFixed(2),
      horizonDays,
      dataSufficiency: forecastResult.dataSufficiency,
      historicalDaysAnalyzed: HISTORICAL_WINDOW_DAYS,
      historicalTransactionCount: totalTransactionCount,
      metrics: forecastResult.metrics,
      series: forecastResult.series,
    };

    await cacheService.set(cacheKey, result, CACHE_TTL_SECONDS);
    return result;
  }

  async getBudgetDepletion(
    userId: string,
    query: { currency?: string },
  ): Promise<BudgetDepletionReportDto> {
    await this.ensureForecastingEnabled();
    const cacheKey = `finwise:cache:forecast:${userId}:budget-depletion:${JSON.stringify(query)}`;

    const cached = await cacheService.get<BudgetDepletionReportDto>(cacheKey);
    if (cached) {
      return cached;
    }

    const now = new Date();
    const asOfDate = instantToBusinessDate(now);
    const asOfInstant = businessWallTimeToInstant(asOfDate);

    const budgets = await this.repository.findActiveBudgets(
      userId,
      asOfInstant,
      query.currency,
    );

    const items = ForecastMathEngine.computeBudgetDepletions(budgets, asOfDate);

    const result: BudgetDepletionReportDto = {
      asOfDate,
      currency: query.currency ?? null,
      items,
    };

    await cacheService.set(cacheKey, result, CACHE_TTL_SECONDS);
    return result;
  }

  static async invalidateForecastCache(userId: string): Promise<void> {
    await cacheService.clearPattern(`finwise:cache:forecast:${userId}:*`);
  }
}
