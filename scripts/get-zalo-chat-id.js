require('dotenv').config();

const token = process.env.ZALO_BOT_TOKEN;
if (!token) {
  console.error('❌ Lỗi: Không tìm thấy biến ZALO_BOT_TOKEN trong file .env');
  process.exit(1);
}

const API_BASE = 'https://bot-api.zaloplatforms.com';

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
  console.log('🔄 Đang kiểm tra thông tin Bot qua Zalo API...');
  const me = await callBot('getMe');
  if (!me.ok) {
    console.error('❌ Lỗi xác thực token Bot:', me);
    process.exit(1);
  }

  const botInfo = me.result;
  console.log('\n=============================================================');
  console.log('🤖 THÔNG TIN BOT FINWISE CỦA BẠN:');
  console.log(`   - Tên Bot:         ${botInfo.display_name || 'Bot'}`);
  console.log(`   - Username / ID:   ${botInfo.account_name || botInfo.id}`);
  console.log(`   - Bot ID số:       ${botInfo.id}`);
  console.log('=============================================================');
  console.log('\n👉 HƯỚNG DẪN:');
  console.log(`1. Mở Zalo, tìm kiếm: "${botInfo.account_name}" hoặc "${botInfo.display_name}".`);
  console.log('   (Lưu ý: Nhắn vào đúng chat của BOT, không nhắn vào OA "Zalo Bot Manager")');
  console.log('2. Gửi một tin nhắn bất kỳ (ví dụ: "hi", "xin chào").');
  console.log('\n⏳ Đang lắng nghe tin nhắn đến từ Zalo (nhấn Ctrl+C để dừng)...');

  let running = true;
  process.on('SIGINT', () => {
    running = false;
    console.log('\n🛑 Đã dừng lắng nghe.');
    process.exit(0);
  });

  while (running) {
    try {
      const data = await callBot('getUpdates', { timeout: 10 });
      if (data && data.ok && Array.isArray(data.result) && data.result.length > 0) {
        for (const item of data.result) {
          const msg = item.message;
          if (!msg) continue;

          const senderName = msg.from?.display_name || 'Người dùng';
          const chatId = msg.chat?.id || msg.from?.id;
          const userText = msg.text || '(Tin nhắn media/không có text)';

          console.log('\n🎉 =============================================================');
          console.log(`✅ ĐÃ BẮT ĐƯỢC TIN NHẮN TỪ: "${senderName}"`);
          console.log(`   Nội dung: "${userText}"`);
          console.log('-------------------------------------------------------------');
          console.log(`👉 CHAT ID CỦA BẠN LÀ:   ${chatId}`);
          console.log('-------------------------------------------------------------');
          console.log('👉 Hãy copy CHAT ID ở trên và dán vào FinWise:');
          console.log('   Cài đặt thông báo -> Bật Zalo -> Nhập Chat ID -> Lưu');
          console.log('=============================================================\n');

          // Phản hồi lại qua Zalo
          try {
            await callBot('sendMessage', {
              chat_id: chatId,
              text: `Chào ${senderName}! 🎉\n\nFinWise Bot đã nhận diện thành công tài khoản của bạn.\n\n🔑 Chat ID của bạn là:\n${chatId}\n\nHãy dán Chat ID này vào Cài đặt thông báo FinWise nhé!`,
            });
            console.log('✉️  Đã gửi tin nhắn phản hồi chứa Chat ID trực tiếp về Zalo cho bạn!');
          } catch (replyErr) {
            console.warn('⚠️ Gửi tin phản hồi lỗi:', replyErr.message);
          }

          console.log('\n✅ Đã lấy Chat ID thành công! Bạn có thể tắt cửa sổ này (Ctrl+C).');
          process.exit(0);
        }
      }
    } catch (err) {
      // Tiếp tục vòng lặp
    }
  }
}

main().catch((e) => {
  console.error('Lỗi thực thi:', e);
  process.exit(1);
});
