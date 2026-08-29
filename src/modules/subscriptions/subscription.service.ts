import {
  ConvertSubscriptionToReminderDto,
  DiscoveryReportDto,
} from './subscription.dto';
import { SubscriptionDiscoveryEngine } from './subscription-engine';
import { SubscriptionRepository } from './subscription.repository';
import { RecurringTransactionService } from '../recurring-transactions/recurring-transaction.service';
import { ConvertSubscriptionToRecurringTransactionDto } from '../recurring-transactions/recurring-transaction.dto';

export class SubscriptionService {
  private readonly repository = new SubscriptionRepository();
  private readonly recurringTransactionService = new RecurringTransactionService();

  async discoverSubscriptions(userId: string): Promise<DiscoveryReportDto> {
    const [transactions, existingReminders] = await Promise.all([
      this.repository.getHistoricalExpenseTransactions(userId, 180),
      this.repository.getExistingReminderTitles(userId),
    ]);

    const items = SubscriptionDiscoveryEngine.discover(
      transactions,
      existingReminders,
    );

    return {
      totalDiscovered: items.length,
      items,
    };
  }

  async convertToReminder(
    userId: string,
    input: ConvertSubscriptionToReminderDto,
  ) {
    return this.repository.convertToReminder(userId, input);
  }

  convertToRecurringTransaction(
    userId: string,
    input: ConvertSubscriptionToRecurringTransactionDto,
  ) {
    return this.recurringTransactionService.convertSubscription(userId, input);
  }
}
