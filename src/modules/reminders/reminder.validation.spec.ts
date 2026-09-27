import { updateDailyTransactionReminderSchema } from './reminder.validation';

describe('updateDailyTransactionReminderSchema', () => {
  it('should accept valid payload with isActive and valid time', () => {
    const valid = { isActive: true, time: '20:00' };
    const parsed = updateDailyTransactionReminderSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('should accept payload with only isActive', () => {
    const valid = { isActive: false };
    const parsed = updateDailyTransactionReminderSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('should reject invalid time format', () => {
    const invalid = { isActive: true, time: '25:00' };
    const parsed = updateDailyTransactionReminderSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it('should reject non-time string', () => {
    const invalid = { isActive: true, time: 'invalid' };
    const parsed = updateDailyTransactionReminderSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it('should strip unknown fields without validating or storing templates', () => {
    const payload = { isActive: true, time: '08:30', title: 'Ignored', message: 'Ignored' };
    const parsed = updateDailyTransactionReminderSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ isActive: true, time: '08:30' });
      expect((parsed.data as any).title).toBeUndefined();
      expect((parsed.data as any).message).toBeUndefined();
    }
  });
});
