# Project Memory

## Date/time architecture (2026-08-16)

- `Asia/Ho_Chi_Minh` is the single business/display timezone.
- Transaction `date`, Budget `startDate`/`endDate`, and Saving Goal `targetDate` are date-only API values (`YYYY-MM-DD`) backed by PostgreSQL `DATE`; budget end dates are inclusive.
- Absolute instants (auth expirations, transfers, contributions, notifications, reminders, and metadata) use offset-aware ISO 8601 at the API boundary and PostgreSQL `TIMESTAMPTZ(3)`.
- Report calendar boundaries and reminder recurrence are resolved in the IANA business timezone, never from host/device timezone or a client-supplied numeric offset.

File này chỉ lưu sự thật và quyết định dài hạn giúp các phiên sau không phải suy
đoán lại. Cập nhật khi một mục bên dưới thay đổi; không ghi diễn biến từng phiên.

## Quyết định đang có hiệu lực

- Kiến trúc backend theo module và các layer:
  `route -> validation -> controller -> service -> repository`.
- Prisma access nằm trong repository; service giữ business rule.
- API lỗi có chủ đích dùng `AppError` kết hợp `ERROR_CODE`.
- Soft delete user dùng `deletedAt`, `deletedBy`, vô hiệu hóa user và thu hồi
  refresh token.
- API version hiện tại là `/api/v1`.
- Package manager chuẩn là pnpm.
- Category hệ thống là dữ liệu dùng chung (`userId = null`, `isSystem = true`) và chỉ đọc
  qua API; category người dùng được kiểm soát ownership, dùng archive thay cho xóa vật lý.
- Transaction dùng số tiền dương và `type` để xác định chiều biến động số dư; create,
  update và delete giao dịch cập nhật Wallet trong Prisma transaction mức Serializable.
- Transfer lưu riêng lịch sử chuyển tiền giữa hai ví cùng tiền tệ. Create yêu cầu hai ví đang hoạt động,
  khác nhau, thuộc cùng người dùng và ví nguồn đủ số dư; create/delete cập nhật cả hai số dư cùng bản ghi
  Transfer trong Prisma transaction mức Serializable. Delete là thao tác hiệu chỉnh nên vẫn hoàn tác được
  vào ví đã archive; mọi thay đổi Transfer đều xóa cache báo cáo tài chính của người dùng.
- Hóa đơn Transaction mới được lưu riêng tư trên Cloudflare R2 dưới prefix ownership
  `receipts/<userId>/`, chỉ đọc qua API có auth; hỗ trợ JPEG, PNG, WebP, PDF và giới hạn mặc định
  5 MB. Backend vẫn đọc/xóa tương thích key local cũ dưới `storage/receipts`.
- Upload file mới dùng mô hình browser tải trực tiếp lên Cloudflare R2 qua presigned PUT URL
  do backend cấp. Hiện chỉ bật purpose `avatar` (JPEG/PNG/WebP, mặc định 5 MB), object key do
  server sinh theo user và public URL chỉ được lưu vào profile sau khi PUT thành công. Khi mở rộng,
  mỗi purpose phải có ownership prefix, MIME/size/TTL riêng; tài liệu riêng tư không dùng public URL.
- Avatar lưu điểm lấy nét theo phần trăm `avatarPositionX`/`avatarPositionY` (0-100, mặc định
  50/50) để frontend hiển thị crop nhất quán; xóa avatar đặt URL về null và reset điểm lấy nét.
- Budget có `currency` riêng (mặc định `VND`), hỗ trợ phạm vi tổng (`OVERALL`) hoặc
  danh mục chi (`CATEGORY`), chu kỳ `CUSTOM`, `WEEKLY`, `MONTHLY`, `YEARLY` và archive
  để giữ lịch sử. Mức sử dụng, phần trăm cùng cảnh báo ngưỡng được tổng hợp trực tiếp
  từ Transaction `EXPENSE` cùng currency trong `[startDate, endDate)` khi đọc API.
  Hỗ trợ tính năng tự động gia hạn chu kỳ (`isRecurring`, `autoRenew`, `recurrenceGroupId`,
  `rolloverMode`, `rolloverAmount`, `autoRenewUntil`). Kích hoạt song song qua Background
  Worker chạy định kỳ và cơ chế JIT Fallback trong `BudgetService.findAll` khi người dùng
  truy cập danh sách ngân sách. Khóa duy nhất `(recurrenceGroupId, startDate)` đảm bảo
  tính idempotency, tránh tạo trùng lặp chu kỳ.
- Saving Goal có trạng thái `ACTIVE`, `PAUSED`, `COMPLETED`, dùng archive để giữ lịch sử
  và tổng hợp tiến độ từ Saving Contribution. Trạng thái hoàn thành được đồng bộ tự
  động trong transaction Serializable khi contribution hoặc số tiền mục tiêu thay đổi;
  contribution không tự động thay đổi số dư Wallet.
- Financial Reports là module chỉ đọc, tổng hợp trực tiếp Wallet, Transaction, Budget và
  Saving Goal. Báo cáo dùng khoảng thời gian `[from, to)`, hỗ trợ preset ngày/tuần/tháng/năm
  hoặc custom tối đa 1830 ngày, bucket theo offset múi giờ và luôn tách số tiền theo currency.
- Notification dùng inbox theo ownership và database-backed delivery outbox với khóa chống
  trùng theo sự kiện. Kênh mặc định là `IN_APP`; email dùng SMTP hiện có, còn Zalo/push giữ
  trạng thái delivery riêng để bổ sung provider adapter sau.
  Thông báo in-app và số lượng chưa đọc (`unread-count`) được phát thời gian thực tới client qua
  Server-Sent Events (`GET /api/v1/notifications/stream`), quản lý kết nối và phát sóng bởi
  `NotificationStreamService` (hỗ trợ Redis Pub/Sub đa instance và in-memory fallback).
- Reminder hỗ trợ `ONCE`, `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`, có khoảng lặp và ngày kết
  thúc. Worker nền trong process xử lý reminder, cảnh báo ngân sách/mục tiêu và retry delivery;
  có thể tắt hoặc chỉnh chu kỳ bằng các biến `NOTIFICATION_*`.
- Giao dịch tự động định kỳ lưu template/lịch riêng với `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`,
  hỗ trợ pause/resume, ngày kết thúc và chính sách `SKIP`/`CATCH_UP`. Worker dùng business date
  UTC+7, distributed lock và occurrence unique `(scheduleId, scheduledFor)`; bản ghi Transaction
  cùng biến động Wallet được commit nguyên tử trong transaction Serializable. Xóa lịch là xóa mềm
  và không xóa hoặc hoàn tác các giao dịch đã ghi.
- Giao dịch chi bất thường được cảnh báo khi có ít nhất 5 giao dịch lịch sử 90 ngày trong cùng
  ví và số tiền mới đạt ít nhất 3 lần trung bình; đây là heuristic có thể thay bằng AI sau.
- AI Financial Assistant là module read-only/stateless dưới `/api/v1/ai-assistant`, gồm phân loại
  giao dịch, OCR hóa đơn, hỏi đáp, phân tích xu hướng/bất thường và khuyến nghị ngân sách/tiết kiệm.
  Tích hợp AI đi qua `AIProvider`; adapter mặc định là Gemini REST và hỗ trợ danh sách key xoay vòng,
  failover. Context không chứa thông tin profile, location hoặc receipt URL, có giới hạn dữ liệu,
  output token, timeout và rate limit riêng; mọi structured output được Zod kiểm tra lại.
- Quy ước tổ chức validation của module AI: `ai-assistant.validation.ts` chỉ chứa Zod schema cho
  HTTP input; `ai-assistant-response.validation.ts` chứa Zod schema kiểm tra output từ AI;
  `ai-assistant-provider.schema.ts` chứa JSON Schema gửi cho provider. Service chỉ chọn và áp dụng
  validator/schema theo use case, không khai báo Zod schema trực tiếp trong file service.
- Hệ thống tối ưu hóa và bảo mật sử dụng CacheService (Redis kết hợp in-memory fallback tự dọn dẹp) cho danh mục hệ thống và báo cáo tài chính; dữ liệu cache báo cáo tự động xóa theo pattern khi ví, giao dịch, ngân sách hoặc mục tiêu tiết kiệm thay đổi.
- LockService cung cấp phân phối khoá (Redis hoặc memory fallback) nhằm ngăn chặn tranh chấp chạy song song của worker nền trong môi trường production.
- Rate Limiting tổng thể được xây dựng để sử dụng Redis (kết hợp memory fallback an toàn, có cơ chế tự giải phóng dữ liệu tránh rò rỉ bộ nhớ).
- Hệ thống log sử dụng LoggerService, đầu ra JSON ở production và text màu ở development, hỗ trợ ẩn thông tin nhạy cảm.
- Môi trường production được container hóa bằng Dockerfile (multi-stage) chạy với user phi quản trị và docker-compose.yml có thiết hành kiểm tra sức khoẻ (healthcheck) cho Postgres và Redis.
- Script seed (prisma/seed.ts) được mở rộng để tự động tạo dữ liệu mẫu demo phong phú (Wallets, Transactions, Budgets, SavingGoals, Contributions, Notifications, Reminders) cho tài khoản user@finwise.local.
- Dynamic RBAC (Role-Based Access Control) là kiến trúc phân quyền chính thức: Phân quyền dựa trên Permission (Role -> Permissions -> User), KHÔNG hardcode quyền theo tên Role.
- QUY TẮC BẮT BUỘC: Tất cả tên quyền (Permission names) PHẢI được định nghĩa tập trung trong `src/common/constants/permission.constant.ts` (ở cả BE và FE), TUYỆT ĐỐI KHÔNG hardcode chuỗi string permission rải rác trong code.
- Mọi route endpoint nghiệp vụ ở backend bắt buộc được bảo vệ bằng middleware `requirePermission(PERMISSIONS.*)`.
- Các vai trò hệ thống mặc định/bất biến (Bootstrap & System protection) được định nghĩa tập trung qua `SYSTEM_ROLES` trong `src/common/constants/system-role.constant.ts` (ví dụ `SYSTEM_ROLES.USER` cho vai trò đăng ký mặc định, `SYSTEM_ROLES.ADMIN` cho vai trò quản trị bất biến), không dùng `SYSTEM_ROLES` để kiểm tra phân quyền.
- Endpoint đăng nhập `POST /api/v1/auth/login` hỗ trợ linh hoạt cả email và số điện thoại thông qua trường `email` hoặc `account`, tự động chuẩn hóa định dạng số điện thoại Việt Nam và truy vấn role đi kèm.

## Trạng thái đã biết

- Khi Prisma Client đã được generate với field mới nhưng database chưa chạy migration tương ứng,
  mọi query lấy toàn bộ model có thể lỗi `P2022` (ví dụ `users.avatar_position_x` không tồn tại)
  ngay cả ở luồng không trực tiếp dùng field đó như đăng nhập. Sau thay đổi schema phải áp dụng
  migration trước khi khởi động lại server; dùng `prisma migrate status` để xác nhận và
  `prisma migrate deploy` cho migration cộng thêm an toàn, tuyệt đối không reset database.
- Đã thiết lập khung kiểm thử tích hợp (integration tests) bằng Jest và Supertest, chạy kiểm thử qua lệnh pnpm test sử dụng cấu hình môi trường test cô lập (REDIS_ENABLED=false để chạy in-memory cache).
- Hệ thống linting đã được cấu hình qua eslint.config.mjs (flat config, bỏ qua các tệp test & configs liên quan) và chạy sạch sẽ khi gọi pnpm run lint.
- `env.config.ts` dùng port fallback `8888`, còn `.env.example` dùng `7777`; README
  ghi rõ cả hai và dùng `7777` cho hướng dẫn chạy theo file env mẫu.
- Transfer đã có API theo ownership dưới `/api/v1/transfers`; migration
  `20260814120000_add_transfer_management` thêm lịch sử chuyển tiền, quan hệ hai ví và các index truy vấn.
- Wallet, Category, Transaction và Budget đã có API theo ownership; Category đồng
  thời trả các category hệ thống dùng chung.
- Financial Reports có API tổng quan, chuỗi dòng tiền, cơ cấu chi tiêu theo danh mục và
  hiệu quả ngân sách dưới `/api/v1/reports`.
- AI Financial Assistant có 5 API đã mô tả trong Swagger. Module không cần model/migration mới;
  cần cấu hình `GEMINI_API_KEYS` để gọi provider, nếu thiếu thì chỉ các AI endpoint trả lỗi 503.
- Các migration `20260728170000_improve_wallet_management` và
  `20260728190000_add_category_management` đồng bộ thay đổi của Wallet và Category;
  `20260728210000_add_transaction_management` đồng bộ Decimal, receipt/location và index
  của Transaction; `20260729100000_add_budget_management` đồng bộ Decimal, loại,
  chu kỳ, ngưỡng cảnh báo, archive và index của Budget;
  `20260731100000_add_saving_goals_management` thêm Saving Goal, Saving Contribution,
  lifecycle, constraint và index phục vụ theo dõi tiến độ;
  `20260803120000_add_budget_currency` thêm currency và index thời gian theo currency
  cho Budget, backfill dữ liệu hiện có bằng `VND`.
  `20260804120000_add_notification_reminder_system` thêm notification inbox, preferences,
  delivery outbox và user reminders cùng các enum/index phục vụ worker nền.
  `20260820120000_add_recurring_transactions` thêm lịch giao dịch định kỳ, occurrence idempotency,
  quan hệ với transaction được tạo và các index phục vụ worker.
  `20260910183000_add_budget_recurrence` thêm cấu hình tự động gia hạn ngân sách (`isRecurring`,
  `autoRenew`, `recurrenceGroupId`, `rolloverMode`, `rolloverAmount`, `autoRenewUntil`), quan hệ phả hệ
  chu kỳ (`parentBudgetId`), enum `BudgetRolloverMode` và ràng buộc duy nhất `(recurrenceGroupId, startDate)`.
  Migration history cũ vẫn chưa phản ánh đầy đủ các thay đổi schema của auth đã
  được commit trước đó.

## Khi cập nhật file này

- Ghi quyết định cuối cùng, không ghi các phương án đã loại.
- Không ghi secret hoặc dữ liệu từ `.env`.
- Xóa hoặc sửa mục cũ khi nó không còn đúng.
