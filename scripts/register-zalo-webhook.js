require('dotenv').config();

const token = process.env.ZALO_BOT_TOKEN;
if (!token) {
  console.error('❌ Lỗi: Không tìm thấy ZALO_BOT_TOKEN trong file .env');
  process.exit(1);
}

const API_BASE = 'https://bot-api.zaloplatforms.com';
const args = process.argv.slice(2);

async function callBot(endpoint, body = {}) {
  const url = `${API_BASE}/bot${token}/${endpoint}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function main() {
  // Flag: Xóa webhook
  if (args.includes('--delete')) {
    console.log('🔄 Đang gửi yêu cầu xóa cấu hình Webhook tới Zalo Bot API...');
    const result = await callBot('deleteWebhook');
    console.log('Kết quả:', JSON.stringify(result, null, 2));
    if (result.ok) {
      console.log('✅ Đã xóa Webhook thành công! Bạn có thể sử dụng lại polling / getUpdates.');
    }
    return;
  }

  // Flag: Xem thông tin webhook hiện tại
  if (args.includes('--info')) {
    console.log('🔄 Đang lấy thông tin Webhook hiện tại...');
    const result = await callBot('getWebhookInfo');
    console.log('Thông tin Webhook:', JSON.stringify(result, null, 2));
    return;
  }

  // Mặc định: Thiết lập Webhook
  const webhookUrl = process.env.ZALO_BOT_WEBHOOK_URL;
  const secretToken = process.env.ZALO_BOT_SECRET_TOKEN;

  if (!webhookUrl) {
    console.error('❌ Lỗi: Chưa cấu hình ZALO_BOT_WEBHOOK_URL trong file .env');
    console.log('💡 Ví dụ: ZALO_BOT_WEBHOOK_URL=https://your-tunnel-domain.trycloudflare.com/api/v1/zalo-bot/webhook');
    process.exit(1);
  }

  if (!secretToken) {
    console.error('❌ Lỗi: Chưa cấu hình ZALO_BOT_SECRET_TOKEN trong file .env (tối thiểu 8 ký tự)');
    process.exit(1);
  }

  console.log('=============================================================');
  console.log('🌐 ĐĂNG KÝ WEBHOOK VỚI ZALO BOT PLATFORM');
  console.log(`   - Webhook URL:    ${webhookUrl}`);
  console.log(`   - Secret Token:   ${secretToken.slice(0, 4)}...${secretToken.slice(-4)}`);
  console.log('=============================================================');

  console.log('🔄 Đang gửi yêu cầu setWebhook...');
  const res = await callBot('setWebhook', {
    url: webhookUrl,
    secret_token: secretToken,
  });

  console.log('\nKết quả từ Zalo Bot API:');
  console.log(JSON.stringify(res, null, 2));

  if (res.ok) {
    console.log('\n🎉 ĐÃ THIẾT LẬP WEBHOOK THÀNH CÔNG!');
    if (res.result?.verification?.ok) {
      console.log('✅ Zalo Server đã xác thực (ping) thành công tới endpoint của bạn.');
    } else if (res.result?.verification) {
      console.log('⚠️ Lưu ý: Zalo đã lưu URL nhưng chưa ping được endpoint.');
      console.log('   Gợi ý:', res.result.verification.hint || res.result.verification.outcome);
    }
  } else {
    console.error('\n❌ Thiết lập Webhook thất bại:', res.description || 'Unknown error');
  }
}

main().catch((err) => {
  console.error('Lỗi thực thi:', err);
  process.exit(1);
});
