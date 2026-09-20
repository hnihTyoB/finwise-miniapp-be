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
  trùng theo sự kiện. Kênh mặc định là `IN_APP`; email dùng SMTP hiện có; kênh `ZALO` dùng
  Zalo Bot API (Phase 1 — outbound-only, `sendMessage` qua `ZaloBotService`). `NotificationSetting`
  lưu `zaloBotChatId` (VARCHAR 100) là chat_id Zalo Bot của user; user tự nhập qua UI sau khi
  nhắn tin cho bot. Token bot đọc từ env `ZALO_BOT_TOKEN`. Push giữ trạng thái stub.
  Thông báo in-app và số lượng chưa đọc (`unread-count`) được phát thời gian thực tới client qua
  Server-Sent Events (`GET /api/v1/notifications/stream`), quản lý kết nối và phát sóng bởi
  `NotificationStreamService` (hỗ trợ Redis Pub/Sub đa instance và in-memory fallback).
- Reminder hỗ trợ `ONCE`, `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`, có khoảng lặp và ngày kết
  thúc. Worker nền trong process xử lý reminder, cảnh báo ngân sách/mục tiêu và retry delivery;
  có thể tắt hoặc chỉnh chu kỳ bằng các biến `NOTIFICATION_*`.
- Subscription discovery dùng `SubscriptionDiscoveryEngine` phân tích 180 ngày giao dịch EXPENSE để
  phát hiện gói cước định kỳ. Threshold `isPriceDrift` là 8% (không phải 3%) để tránh false positive
  từ biến động tỷ giá ngoại tệ. Message nhắc nhở dùng `currency` thực tế của subscription thay vì
  hardcode VND. Worker nền chạy `scanAndNotifyNewDiscoveries()` theo chu kỳ `subscriptionScanIntervalMs`
  (mặc định 24h, env: `NOTIFICATION_SUBSCRIPTION_SCAN_INTERVAL_MS`), duyệt user theo cursor batch 50,
   chỉ notify các subscription có `confidenceScore >= 0.85` và chưa được link với recurring schedule hoặc reminder; dedupKey
   theo ngày tránh gửi lặp. Notification dẫn về `actionUrl: /recurring-transactions` để người dùng thêm vào lịch tự động.
   API discover kiểm tra cả `RecurringTransactionSchedule` (`isLinkedToSchedule`) để không gợi ý lại các khoản đã lên lịch.
   API convert-to-reminder tiếp tục hỗ trợ `remindDaysBefore` (0-30 ngày) cho các tác vụ cần tạo lịch nhắc.
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
- Luồng Zalo Login (`POST /api/v1/auth/zalo-login`) bắt buộc số điện thoại phải được giải mã từ Zalo Server qua `phoneToken` hoặc Graph API (`isPhoneVerified = true`). Nghiêm cấm gán quyền hoặc liên kết tài khoản dựa trên số điện thoại client tự gửi chưa xác thực (trả về `409 Conflict PHONE_ALREADY_REGISTERED_UNVERIFIED` nếu trùng tài khoản). Các cuộc gọi HTTP ra Zalo Graph API bắt buộc giới hạn timeout tối đa 5 giây qua `AbortSignal.timeout(5000)`.
- Cơ chế Fail-Fast bảo vệ Secret trên Production: Lúc khởi động (`envConfig`), nếu `NODE_ENV === 'production'`, hệ thống ném ngoại lệ dừng tiến trình ngay lập tức nếu `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, hoặc `API_KEY_SECRET` ngắn hơn 32 ký tự hoặc chứa từ khóa mặc định.
- AI Natural Language Query (`QueryCompiler`) phân nhóm theo loại tiền tệ của ví (`currencyTotals`), gán `resolvedCurrency = 'MULTI'` và xuất chi tiết từng loại tiền nếu phát hiện giao dịch đa tiền tệ; cấm cộng gộp trực tiếp các loại tiền khác nhau thành một giá trị vô hướng duy nhất.
- IP Whitelist của API Key (`apiKeyMiddleware`) sử dụng `req.ip || req.socket?.remoteAddress` qua cơ chế tin cậy proxy của Express (`trust proxy`); cấm đọc trực tiếp header `X-Forwarded-For` chưa qua xác thực từ client để chống IP Spoofing.
- Tách tiến trình gia hạn ngân sách định kỳ (Budget Auto-Renew) hoàn toàn khỏi luồng đọc `GET /budgets` sang worker nền (`notification.worker.ts`) bảo vệ bởi distributed lock (`LockService`), triệt tiêu N+1 queries và transaction lock contention trên API đọc.
- Rút token JWT qua query string (`?token=`) được giới hạn nghiêm ngặt duy nhất cho kết nối Server-Sent Events (`/api/v1/notifications/stream`). Toàn bộ các API HTTP khác bắt buộc truyền qua header `Authorization: Bearer <token>`.
- Quét subscription định kỳ và tính toán ngày nghiệp vụ sử dụng thống nhất hàm `instantToBusinessDate()` (`Asia/Ho_Chi_Minh` UTC+7) từ `business-time.ts`.
- Tự động lưu trữ và dọn dẹp Nhật ký kiểm toán (Audit Log Archiving & Retention): Tích hợp tác vụ định kỳ 24h trong worker nền (`notification.worker.ts`) bảo vệ bởi distributed lock (`LockService`). Mặc định lưu trữ 30 ngày (cấu hình qua SystemSetting `security.audit_log_retention_days`). Trước khi xóa các bản ghi cũ khỏi DB, toàn bộ dữ liệu được nén thành file Gzip (`.json.gz`) lưu trữ tại `storage/archives/audit-logs/` (và tự động upload lên Cloudflare R2 nếu có cấu hình). Hành động dọn dẹp tự động ghi nhận 1 bản ghi kiểm toán `AUDIT_LOGS_ARCHIVE_CLEANUP` lưu metadata đợt dọn dẹp. Cung cấp API `POST /api/v1/audit-logs/archive-cleanup` bảo vệ bởi quyền `AUDIT_LOG_READ` cho quản trị viên kích hoạt thủ công.
- Module Nhật ký kiểm toán (`src/modules/audit-logs/`) được tách biệt hoàn toàn khỏi `rbac`, gồm đầy đủ các tầng `audit-log.dto`, `audit-log.validation`, `audit-log.repository`, `audit-log.service`, `audit-log-archive.service`, `audit-log.controller`, `audit-log.route`. Mount tại `/api/v1/audit-logs`. `rbacRepository` giữ các hàm uỷ quyền (delegation) `createAuditLog` và `findAllAuditLogs` để đảm bảo tính tương thích ngược tuyệt đối với các caller hiện có.
- Xuất sao kê giao dịch bất đồng bộ (Asynchronous Statement Exporter):
  - Model `StatementJob` lưu trữ trạng thái PENDING/PROCESSING/COMPLETED/FAILED, định dạng `XLSX`, `PDF`, `CSV`, liên kết `User` và `Wallet`.
  - Endpoint `POST /api/v1/statements/export` nhận yêu cầu, đẩy payload vào hàng đợi BullMQ `finwise-statement-export` (hoặc xử lý fallback direct khi Redis tắt) và trả về ngay HTTP 202 Accepted.
  - Worker trích xuất dữ liệu bằng Cursor-based pagination (`findBatchForExport` trên `TransactionRepository`) đảm bảo RAM O(1) theo từng batch (mặc định 500 bản ghi).
  - Excel (.xlsx) gồm 4 sheet chuyên biệt (Tổng quan dòng tiền, Bảng kê chi tiết, Phân bổ danh mục, Số dư lũy kế theo ngày) và hỗ trợ khóa bảo vệ trang tính (Sheet Protection) chống sửa đổi.
  - PDF (.pdf) tuân thủ tiêu chuẩn ngân hàng: Watermark bảo mật xoay 45° (lineBreak: false), bảng kê zebra striping, logo FinWise, mã QR xác thực tính hợp lệ dẫn tới `/api/v1/statements/verify/:code`.
  - CSV (.csv) tuân thủ RFC 4180 và đính kèm UTF-8 BOM (`\uFEFF`) để hiển thị đúng tiếng Việt có dấu trên Microsoft Excel Windows.
  - Tệp kết xuất được lưu trữ riêng tư trên Cloudflare R2 (prefix `statements/<userId>/<jobId>.<ext>`) và cấp Presigned GET URL thời hạn 48 giờ.
  - Tự động phát thông báo In-app và tin nhắn Zalo Bot (`ZaloBotService`) khi tệp hoàn tất.
  - Tải file bảo mật qua `/api/v1/statements/jobs/:id/download` (và alias `/download/:id`), bảo vệ bằng quyền `STATEMENT_READ`, kiểm tra ownership chống IDOR, kiểm tra trạng thái COMPLETED và hạn sử dụng; tự động redirect 302 đến presigned URL nếu dùng Cloudflare R2 hoặc stream tệp trực tiếp từ local storage.
  - Quyền hạn kiểm soát: `STATEMENT_EXPORT` cho khởi tạo xuất file, `STATEMENT_READ` cho xem lịch sử, chi tiết job và tải file. Endpoint xác thực QR `/api/v1/statements/verify/:code` là public và tự động che tên người dùng (masking).

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
- Giao dịch tự động định kỳ hỗ trợ thông báo nhắc nhở trước hạn thanh toán qua trường tùy chọn `remindDaysBefore` (0–30 ngày). Nhắc nhở được liên kết nguyên tử với bảng Reminder (`type: RECURRING_PAYMENT`, `actionUrl: /recurring-transactions?id=${scheduleId}&remindDaysBefore=${days}`) không cần migration DB; tự động xóa, cập nhật, tạm dừng hoặc khôi phục đồng bộ theo trạng thái của lịch giao dịch. Thuật toán phát hiện Subscription tự động quét giao dịch định kỳ, phát hiện tăng giá cước (> 5.0%), liên kết trực tiếp vào lịch giao dịch tự động và loại trừ các dịch vụ đã được lên lịch.
  Migration history cũ vẫn chưa phản ánh đầy đủ các thay đổi schema của auth đã
  được commit trước đó.

## Khi cập nhật file này

- Ghi quyết định cuối cùng, không ghi các phương án đã loại.
- Không ghi secret hoặc dữ liệu từ `.env`.
- Xóa hoặc sửa mục cũ khi nó không còn đúng.
