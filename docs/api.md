# Hướng dẫn và Mô tả Chi tiết API FinWise

FinWise API được xây dựng theo chuẩn RESTful, trả về dữ liệu định dạng JSON nhất quán và hỗ trợ tích hợp trực quan qua Swagger UI.

---

## 1. Cổng Thông tin Tài liệu API (Swagger UI)

*   **Đường dẫn truy cập cục bộ**: `http://localhost:7777/api/docs`
*   **Giao diện**: Swagger UI được cấu hình với giao diện tối tối ưu (dark mode), cho phép thử nghiệm trực tiếp các tham số request và xem chi tiết cấu trúc JSON Schema cho từng API.

---

## 2. Chuẩn Giao tiếp & Xác thực

### 2.1 Cấu trúc Phản hồi Chuẩn (Response Schema)

#### Phản hồi Thành công (Success Response):
Mọi response thành công đều trả về HTTP Status `2xx` và có thuộc tính `success: true`:
```json
{
  "success": true,
  "data": {
    "id": "c30172bf-d6ff-4340-9a84-0a3ffb1d9bf8",
    "name": "Ví tiền mặt",
    "balance": "4500000.00",
    "currency": "VND"
  }
}
```

#### Phản hồi Thất bại (Error Response):
Mọi response lỗi đều trả về HTTP Status tương ứng (`4xx`, `5xx`) và có cấu trúc:
```json
{
  "success": false,
  "message": "Thông điệp mô tả lỗi chi tiết cho client",
  "code": "ERROR_CODE_NGHIEP_VU"
}
```
*Các mã lỗi nghiệp vụ (`code`) thông dụng*: `INVALID_CREDENTIALS`, `USER_INACTIVE`, `UNAUTHORIZED`, `TOKEN_EXPIRED`, `TOKEN_INVALID`, `NOT_FOUND`, `DUPLICATE_ENTRY`, `RATE_LIMIT_EXCEEDED`, `SERVICE_UNAVAILABLE`.

### 2.2 Xác thực qua Token JWT
Hệ thống sử dụng cơ chế token kép (Access Token và Refresh Token):
1.  **Access Token**: Truyền qua Header HTTP:
    ```http
    Authorization: Bearer <Your_Access_Token>
    ```
    *Hoặc* hệ thống sẽ tự động đọc từ Cookie HTTP-only `accessToken` nếu có.
2.  **Refresh Token**: Được lưu tự động trong Cookie HTTP-only `refreshToken` khi đăng nhập thành công. Để làm mới cặp token, gọi API `/auth/refresh`.

---

## 3. Danh sách Endpoints Chính

Tất cả các endpoint bên dưới có tiền tố (prefix) mặc định: `/api/v1`

### 3.1 Hệ thống & Xác thực (Auth)
*   `GET /health` [Public] - Kiểm tra sức khỏe của API, database, cache và đo độ trễ.
*   `POST /auth/register` [Public] - Đăng ký tài khoản (kích hoạt qua token email).
*   `GET /auth/verify-email?token=<token>` [Public] - Xác thực email để active tài khoản.
*   `POST /auth/login` [Public] - Đăng nhập tài khoản, nhận token và lưu cookie.
*   `GET /auth/me` [Bearer] - Lấy thông tin tài khoản hiện tại.
*   `POST /auth/refresh` [Public] - Dùng Refresh Token để làm mới cặp Access/Refresh Token.
*   `POST /auth/logout` [Public] - Đăng xuất và thu hồi Refresh Token trong DB.
*   `PUT /auth/profile` [Bearer] - Cập nhật thông tin cá nhân (họ tên, số điện thoại, avatar và vị trí crop 0-100%); gửi `avatarUrl: null` để xóa avatar khỏi hồ sơ.
*   `POST /uploads/presign` [Bearer] - Tạo presigned PUT URL để browser tải avatar trực tiếp lên Cloudflare R2.
*   `PUT /auth/password` [Bearer] - Đổi mật khẩu tài khoản.
*   `POST /auth/forgot-password` [Public] - Gửi email khôi phục mật khẩu.
*   `POST /auth/reset-password` [Public] - Đặt lại mật khẩu mới sử dụng token.
*   `GET /auth/sessions` [Bearer] - Danh sách các thiết bị/phiên đăng nhập hoạt động.
*   `DELETE /auth/sessions/:id` [Bearer] - Đăng xuất từ xa một phiên thiết bị cụ thể.

### 3.2 Quản trị Người dùng (Users) - Chỉ dành cho vai trò ADMIN
*   `GET /users` - Lấy danh sách người dùng kèm phân trang, tìm kiếm và lọc trạng thái.
*   `POST /users` - Admin tạo tài khoản người dùng trực tiếp.
*   `PUT /users/:id` - Admin cập nhật trạng thái hoạt động (`isActive`) hoặc vai trò (`roleId`).
*   `DELETE /users/:id` - Admin thực hiện xóa mềm (Soft-delete) tài khoản người dùng.

### 3.3 Quản lý Ví (Wallets) - Theo quyền sở hữu (Ownership)
*   `GET /wallets` [Bearer] - Lấy danh sách ví hoạt động (kèm số dư, icon, màu sắc).
*   `POST /wallets` [Bearer] - Tạo ví mới (hỗ trợ các loại tiền tệ VND, USD,...).
*   `GET /wallets/:id` [Bearer] - Xem chi tiết một ví.
*   `PUT /wallets/:id` [Bearer] - Cập nhật thông tin ví.
*   `PATCH /wallets/:id/default` [Bearer] - Thiết lập một ví làm ví mặc định của hệ thống.
*   `DELETE /wallets/:id` [Bearer] - Lưu trữ (archive) ví thay vì xóa vật lý để bảo toàn lịch sử giao dịch.

### 3.4 Danh mục Thu Chi (Categories)
*   `GET /categories` [Bearer] - Lấy danh sách category bao gồm danh mục hệ thống (isSystem=true) và danh mục riêng của người dùng.
*   `GET /categories/tree` [Bearer] - Lấy danh sách danh mục theo cấu trúc hình cây (cha - con).
*   `POST /categories` [Bearer] - Tạo danh mục con hoặc danh mục riêng mới.
*   `DELETE /categories/:id` [Bearer] - Lưu trữ (archive) danh mục riêng.

### 3.5 Giao dịch (Transactions) - Tự động đồng bộ số dư ví
*   `GET /transactions` [Bearer] - Danh sách giao dịch có bộ lọc mạnh mẽ theo ví, danh mục, khoảng thời gian, loại thu/chi và phân trang.
*   `POST /transactions` [Bearer] - Tạo giao dịch thu/chi (tự động cộng/trừ số dư ví liên quan dưới database transaction Serializable).
*   `PUT /transactions/:id` [Bearer] - Cập nhật giao dịch (tự động tính toán lại và hoàn tác/cập nhật số dư ví cũ và mới tương ứng).
*   `DELETE /transactions/:id` [Bearer] - Xóa giao dịch (tự động hoàn trả số dư ví về trạng thái trước giao dịch).
*   `PUT /transactions/:id/receipt` [Bearer] - Tải ảnh hóa đơn riêng tư lên Cloudflare R2 (`receipt`) dạng multipart-form (hỗ trợ JPEG, PNG, WebP, PDF tối đa 5MB).
*   `GET /transactions/:id/receipt` [Bearer] - Xem/Tải xuống tệp hóa đơn đã upload bảo mật.

### 3.6 Ngân sách chi tiêu (Budgets)
*   `GET /budgets` [Bearer] - Danh sách ngân sách kèm tiến độ sử dụng tính theo thời gian thực từ giao dịch chi tiêu tương ứng.
*   `POST /budgets` [Bearer] - Tạo ngân sách tổng quát (`OVERALL`) hoặc theo danh mục chi tiêu (`CATEGORY`) với ngưỡng cảnh báo tùy chọn.

### 3.7 Mục tiêu tiết kiệm (Saving Goals)
*   `GET /saving-goals` [Bearer] - Danh sách mục tiêu tiết kiệm và tiến trình đạt được (%).
*   `POST /saving-goals` [Bearer] - Tạo mục tiêu mới.
*   `POST /saving-goals/:id/contributions` [Bearer] - Gửi tiền tích lũy vào mục tiêu tiết kiệm (hệ thống tự động cập nhật tiến trình và trạng thái hoàn thành).

### 3.8 Báo cáo tài chính (Reports) - Đọc dữ liệu nhanh có Cache
*   `GET /reports/overview` [Bearer] - Báo cáo tổng quan số dư, tổng thu, tổng chi và dòng tiền ròng.
*   `GET /reports/cash-flow` [Bearer] - Chuỗi dữ liệu dòng tiền theo ngày/tuần/tháng để vẽ biểu đồ đường.
*   `GET /reports/category-distribution` [Bearer] - Cơ cấu chi tiêu phân chia theo danh mục để vẽ biểu đồ tròn.
*   `GET /reports/budget-performance` [Bearer] - So sánh ngân sách và thực tế chi tiêu.

### 3.9 Trợ lý Tài chính AI (AI Assistant)
*   `POST /ai-assistant/chat` [Bearer] - Hỏi đáp tài chính cá nhân với trợ lý AI dựa trên dữ liệu thu chi thực tế của người dùng.
*   `POST /ai-assistant/classify` [Bearer] - Phân tích văn bản giao dịch tự do để đề xuất danh mục thích hợp.
*   `POST /ai-assistant/ocr` [Bearer] - Phân tích ảnh hóa đơn tải lên để tự động bóc tách số tiền, danh mục, ngày tháng.

### 3.10 Cấu hình Công khai Hệ thống (Public Config)
*   `GET /system/public-config` [Public] - Cấu hình công khai của app (tên, phiên bản, trạng thái và thông điệp bảo trì hệ thống, cờ tính năng).

### 3.11 Quản trị Cấu hình Hệ thống & Chế độ Bảo trì (System Settings & Maintenance)
*   `GET /admin/settings` [Bearer: SYSTEM_CONFIG_READ] - Lấy danh sách toàn bộ tham số cấu hình hệ thống (lọc theo `category`).
*   `GET /admin/settings/:key` [Bearer: SYSTEM_CONFIG_READ] - Xem chi tiết một tham số cấu hình.
*   `PUT /admin/settings/:key` [Bearer: SYSTEM_CONFIG_UPDATE] - Cập nhật giá trị tham số cấu hình và ghi nhật ký kiểm toán.
*   `PUT /admin/settings/maintenance` [Bearer: MAINTENANCE_MODE_UPDATE] - Bật/tắt chế độ bảo trì hệ thống (trả về 503 cho người dùng thường, admin bypass).

### 3.12 Quản trị Thông báo Đa kênh (Notification Management)
*   `GET /admin/notifications/overview` [Bearer: NOTIFICATION_ADMIN_READ] - Báo cáo tổng quan số lượng gửi, tỷ lệ thành công, phân bổ theo kênh (IN_APP, EMAIL, PUSH, ZALO).
*   `GET /admin/notifications/deliveries` [Bearer: NOTIFICATION_ADMIN_READ] - Lịch sử phân phối thông báo kèm bộ lọc kênh, trạng thái và phân trang.
*   `POST /admin/notifications/deliveries/:id/retry` [Bearer: NOTIFICATION_RETRY] - Thử lại việc gửi thông báo bị thất bại.
*   `GET /admin/notifications/templates` [Bearer: NOTIFICATION_TEMPLATE_READ] - Danh sách mẫu thông báo song ngữ (vi/en).
*   `PUT /admin/notifications/templates/:id` [Bearer: NOTIFICATION_TEMPLATE_UPDATE] - Cập nhật nội dung mẫu thông báo.
*   `GET /admin/notifications/channels` [Bearer: NOTIFICATION_CONFIG_READ] - Lấy trạng thái kích hoạt của từng kênh gửi tin.
*   `PUT /admin/notifications/channels` [Bearer: NOTIFICATION_CONFIG_UPDATE] - Bật/tắt các kênh phát tán thông báo.

### 3.13 Quản trị Trí tuệ Nhân tạo (AI Administration)
*   `GET /admin/ai/status` [Bearer: AI_ADMIN_READ] - Trạng thái hoạt động của các tính năng AI và model đang kết nối.
*   `PUT /admin/ai/features/:key/toggle` [Bearer: AI_CONFIG_UPDATE] - Bật hoặc tắt khẩn cấp một tính năng AI.
*   `GET /admin/ai/usage` [Bearer: AI_USAGE_READ] - Thống kê tiêu thụ Token (Prompt, Completion, Total), độ trễ phản hồi và số lần chạm trần rate limit theo chu kỳ (today, week, month).
*   `GET /admin/ai/logs` [Bearer: AI_LOG_READ] - Nhật ký chi tiết từng lượt gọi AI LLM (User ID, Model, Tokens, Latency, Error).
*   `GET /admin/ai/rate-limit` [Bearer: AI_CONFIG_READ] - Lấy cấu hình Sliding Window Rate Limit cho AI.
*   `PUT /admin/ai/rate-limit` [Bearer: AI_CONFIG_UPDATE] - Cập nhật số yêu cầu tối đa và thời lượng cửa sổ trượt (Sliding Window) cho AI.

