import { ReminderFrequency } from '@prisma/client';

export interface DiscoveredSubscriptionDto {
  merchantName: string;
  categoryName: string;
  categoryId: string;
  currency: string;
  averageAmount: string;
  latestAmount: string;
  frequency: ReminderFrequency;
  occurrenceCount: number;
  firstObservedAt: string;
  lastObservedAt: string;
  nextExpectedAt: string;
  confidenceScore: number; // 0.00 to 1.00
  isPriceDrift: boolean;
  priceDriftPercentage: number | null;
  isLinkedToReminder: boolean;
  isLinkedToSchedule?: boolean;
}

export interface ConvertSubscriptionToReminderDto {
  merchantName: string;
  amount: string;
  currency?: string;
  frequency: ReminderFrequency;
  /** Renewal date at 09:00 Vietnam time (ISO). Actual trigger = remindAt − remindDaysBefore days. */
  remindAt: string;
  remindDaysBefore?: number; // 0 = same day, default: 2 for MONTHLY, 7 for YEARLY, 0 otherwise
  categoryId?: string;
}

export interface DiscoveryReportDto {
  totalDiscovered: number;
  items: DiscoveredSubscriptionDto[];
}
