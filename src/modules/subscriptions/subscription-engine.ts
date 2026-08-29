import { ReminderFrequency } from '@prisma/client';
import { addBusinessDays, BusinessDate } from '../../common/date-time/business-time';
import { DiscoveredSubscriptionDto } from './subscription.dto';

export interface RawSubscriptionTxn {
  id: string;
  description: string;
  amount: number;
  currency: string;
  categoryId: string;
  categoryName: string;
  date: BusinessDate;
}

export class SubscriptionDiscoveryEngine {
  static normalizeMerchant(description: string): string {
    if (!description) return 'UNKNOWN';

    let clean = description.toUpperCase().trim();

    // Remove common banking/payment noise words
    const noisePrefixes = [
      /^NAP\s+TIEN\s+/i,
      /^THANH\s+TOAN\s+/i,
      /^CHUYEN\s+TIEN\s+/i,
      /^GD\s+/i,
      /^QR\s+/i,
      /^CK\s+/i,
      /^PAYMENT\s+TO\s+/i,
      /^PAYMENT\s+/i,
    ];
    for (const prefix of noisePrefixes) {
      clean = clean.replace(prefix, '');
    }

    // Remove invoice/order numbers and hashes: e.g. #1234, *192839, - 291823, or standalone numbers
    clean = clean.replace(/[#*_-]\s*\d+/g, '');
    clean = clean.replace(/\b\d+\b/g, '');
    clean = clean.replace(/[^\w\s]/gi, ' ').trim(); // Replace punctuation with space
    clean = clean.replace(/\s+/g, ' '); // Collapse multiple spaces

    // Extract first 1-3 prominent words
    const words = clean.split(' ').filter((w) => w.length > 1);
    if (words.length === 0) return 'UNKNOWN';

    return words.slice(0, 3).join(' ');
  }

  static discover(
    transactions: RawSubscriptionTxn[],
    existingReminderTitles: Set<string>,
  ): DiscoveredSubscriptionDto[] {
    // Group transactions by (cleanMerchant, currency)
    const groups = new Map<string, RawSubscriptionTxn[]>();

    transactions.forEach((tx) => {
      const cleanMerchant = this.normalizeMerchant(tx.description);
      if (cleanMerchant === 'UNKNOWN' || cleanMerchant.length < 2) {
        return;
      }
      const key = `${cleanMerchant}:${tx.currency}`;
      const list = groups.get(key) ?? [];
      list.push(tx);
      groups.set(key, list);
    });

    const discovered: DiscoveredSubscriptionDto[] = [];

    groups.forEach((txns, key) => {
      if (txns.length < 3) {
        return; // Need at least 3 occurrences to form a recurring pattern
      }

      // Sort by date ascending
      const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
      const [cleanMerchant, currency] = key.split(':');

      // Check amount variance
      const amounts = sorted.map((t) => t.amount);
      const avgAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
      const latestAmount = amounts[amounts.length - 1];

      const maxAmountDeviation = Math.max(...amounts.map((a) => Math.abs(a - avgAmount)));
      if (maxAmountDeviation / avgAmount > 0.18) {
        return; // Amounts fluctuate too wildly to be a fixed subscription
      }

      // Compute intervals between consecutive transactions
      const intervals: number[] = [];
      for (let i = 0; i < sorted.length - 1; i++) {
        const intervalDays = this.daysBetween(sorted[i].date, sorted[i + 1].date);
        if (intervalDays > 0) {
          intervals.push(intervalDays);
        }
      }

      if (intervals.length < 2) {
        return;
      }

      const meanInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
      const variance =
        intervals.reduce((sum, val) => sum + Math.pow(val - meanInterval, 2), 0) /
        Math.max(1, intervals.length - 1);
      const stdDev = Math.sqrt(variance);

      const regularity = Math.max(0, 1 - stdDev / Math.max(1, meanInterval));

      // Must have high regularity (R >= 0.75)
      if (regularity < 0.75) {
        return;
      }

      // Map to standard frequency
      let frequency: ReminderFrequency | null = null;
      if (meanInterval >= 6 && meanInterval <= 8) {
        frequency = 'WEEKLY';
      } else if (meanInterval >= 26 && meanInterval <= 35) {
        frequency = 'MONTHLY';
      } else if (meanInterval >= 345 && meanInterval <= 380) {
        frequency = 'YEARLY';
      }

      if (!frequency) {
        return; // Non-standard recurrence period
      }

      const lastDate = sorted[sorted.length - 1].date;
      const nextExpectedAt = addBusinessDays(lastDate, Math.round(meanInterval));

      // Calculate confidence score (0.75 to 0.99)
      const countBonus = Math.min(1.0, sorted.length / 5);
      const confidenceScore = Math.min(0.99, Math.round((regularity * 0.7 + countBonus * 0.3) * 100) / 100);

      // Price drift detection (> 3% increase)
      const driftPercent = ((latestAmount - avgAmount) / avgAmount) * 100;
      const isPriceDrift = driftPercent > 3.0;

      // Check if already linked to a user reminder
      const isLinkedToReminder = existingReminderTitles.has(cleanMerchant.toLowerCase());

      const sampleTx = sorted[sorted.length - 1];

      discovered.push({
        merchantName: cleanMerchant,
        categoryName: sampleTx.categoryName,
        categoryId: sampleTx.categoryId,
        currency,
        averageAmount: avgAmount.toFixed(2),
        latestAmount: latestAmount.toFixed(2),
        frequency,
        occurrenceCount: sorted.length,
        firstObservedAt: sorted[0].date,
        lastObservedAt: lastDate,
        nextExpectedAt,
        confidenceScore,
        isPriceDrift,
        priceDriftPercentage: isPriceDrift ? Math.round(driftPercent * 10) / 10 : null,
        isLinkedToReminder,
      });
    });

    return discovered.sort((a, b) => b.confidenceScore - a.confidenceScore);
  }

  private static daysBetween(start: BusinessDate, end: BusinessDate): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    const [y1, m1, d1] = start.split('-').map(Number);
    const [y2, m2, d2] = end.split('-').map(Number);
    const date1 = Date.UTC(y1, m1 - 1, d1);
    const date2 = Date.UTC(y2, m2 - 1, d2);
    return Math.round((date2 - date1) / msPerDay);
  }
}
