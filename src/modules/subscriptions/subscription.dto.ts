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
}

export interface ConvertSubscriptionToReminderDto {
  merchantName: string;
  amount: string;
  frequency: ReminderFrequency;
  remindAt: string; // ISO date string
  categoryId?: string;
}

export interface DiscoveryReportDto {
  totalDiscovered: number;
  items: DiscoveredSubscriptionDto[];
}
