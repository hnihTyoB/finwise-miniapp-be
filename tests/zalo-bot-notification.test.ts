import { formatZaloNotificationText } from '../src/common/services/zalo-bot.service';

describe('formatZaloNotificationText', () => {
  it('does NOT include "Mở trong FinWise" link even when actionUrl is provided', () => {
    const text = formatZaloNotificationText(
      'Cảnh báo số dư',
      'Số dư ví của bạn dưới 50.000 đ',
      '/wallets/wallet-123',
    );

    expect(text).not.toContain('Mở trong FinWise');
    expect(text).not.toContain('👉');
    expect(text).not.toContain('/wallets/wallet-123');
    expect(text).toContain('🔔 **Cảnh báo số dư**');
    expect(text).toContain('Số dư ví của bạn dưới 50.000 đ');
  });

  it('preserves existing emoji prefix in title and does not add duplicate bell emoji', () => {
    const text = formatZaloNotificationText(
      '📊 Sao kê tài chính FinWise đã sẵn sàng!',
      'Nội dung thông báo sao kê',
    );

    expect(text).not.toContain('🔔');
    expect(text).toContain('**📊 Sao kê tài chính FinWise đã sẵn sàng!**');
    expect(text).not.toContain('Mở trong FinWise');
  });

  it('automatically translates English budget alert notifications to Vietnamese', () => {
    const textExceeded = formatZaloNotificationText(
      'Budget exceeded: Ăn uống',
      'Spending has reached 120% of this budget.',
    );

    expect(textExceeded).toContain('**Cảnh báo vượt ngân sách: Ăn uống**');
    expect(textExceeded).toContain('Chi tiêu đã đạt 120% ngân sách này.');
    expect(textExceeded).not.toContain('Budget exceeded');
    expect(textExceeded).not.toContain('Spending has reached');

    const textNearing = formatZaloNotificationText(
      'Budget nearing limit: Mua sắm',
      'Spending has reached 85% of this budget.',
    );

    expect(textNearing).toContain('**Ngân sách gần chạm hạn mức: Mua sắm**');
    expect(textNearing).toContain('Chi tiêu đã đạt 85% ngân sách này.');
  });

  it('automatically translates English saving goal notifications to Vietnamese', () => {
    const textAchieved = formatZaloNotificationText(
      'Saving goal achieved: Mua Macbook',
      'Congratulations! You have reached this saving goal.',
    );

    expect(textAchieved).toContain('**Mục tiêu tiết kiệm hoàn thành: Mua Macbook**');
    expect(textAchieved).toContain('Chúc mừng bạn! Bạn đã hoàn thành mục tiêu tiết kiệm này.');

    const textNear = formatZaloNotificationText(
      'Saving goal almost reached: Tiết kiệm Tết',
      'You have completed 90% of this saving goal.',
    );

    expect(textNear).toContain('**Mục tiêu tiết kiệm sắp đạt: Tiết kiệm Tết**');
    expect(textNear).toContain('Bạn đã hoàn thành 90% mục tiêu tiết kiệm này.');

    const textDue = formatZaloNotificationText(
      'Saving goal deadline approaching: Quỹ khẩn cấp',
      'The target date is 2026-12-31.',
    );

    expect(textDue).toContain('**Hạn mục tiêu tiết kiệm đang đến gần: Quỹ khẩn cấp**');
    expect(textDue).toContain('Hạn hoàn thành mục tiêu là ngày 2026-12-31.');
  });

  it('automatically translates English anomaly and recurring notifications to Vietnamese', () => {
    const textAnomaly = formatZaloNotificationText(
      'Unusual transaction detected',
      'Phát hiện giao dịch diễn ra liên tiếp trong thời gian ngắn.',
    );

    expect(textAnomaly).toContain('**Phát hiện chi tiêu bất thường**');

    const textRecurring = formatZaloNotificationText(
      'Recurring transaction paused',
      'A recurring transaction could not be posted: Ví không đủ tiền',
    );

    expect(textRecurring).toContain('**Giao dịch định kỳ bị tạm dừng**');
    expect(textRecurring).toContain('Không thể thực hiện giao dịch định kỳ: Ví không đủ tiền');
  });
});
