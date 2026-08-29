# FinWise Backend API Service

<p align="center">
  <b>FinWise Backend</b> — Hệ thống dịch vụ API & Sổ cái Tài chính cốt lõi (Financial Ledger Core) phục vụ cho <b>Zalo Mini App</b> và ứng dụng Web.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Express-4.21-000000?logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/PostgreSQL-14+-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Prisma_ORM-5.22-2D3748?logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/Redis-6.0+-DC382D?logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/Cloudflare_R2-Storage-F38020?logo=cloudflare&logoColor=white" alt="Cloudflare R2" />
  <img src="https://img.shields.io/badge/Google_Gemini-AI_Engine-8E75B2?logo=google&logoColor=white" alt="Google Gemini" />
  <img src="https://img.shields.io/badge/Testing-Jest_%26_Supertest-C21325?logo=jest&logoColor=white" alt="Jest" />
</p>

---

## 📑 Mục lục

1. [Tổng quan & Kiến trúc Hệ thống](#-tổng-quan--kiến-trúc-hệ-thống)
2. [Nguyên tắc Bất biến Tài chính & Kiến trúc (Invariants)](#-nguyên-tắc-bất-biến-tài-chính--kiến-trúc-invariants)
3. [Danh mục Tính năng & Các Module Nghiệp vụ](#-danh-mục-tính-năng--các-module-nghiệp-vụ)
4. [Tài liệu API chi tiết (Endpoints Reference)](#-tài-liệu-api-chi-tiết-endpoints-reference)
5. [Công nghệ sử dụng](#-công-nghệ-sử-dụng)
6. [Cấu trúc thư mục](#-cấu-trúc-thư-mục)
7. [Yêu cầu hệ thống](#-yêu-cầu-hệ-thống)
8. [Hướng dẫn Cài đặt & Khởi chạy](#-hướng-dẫn-cài-đặt--khởi-chạy)
9. [Cấu hình Biến Môi trường (.env)](#-cấu-hình-biến-môi-trường-env)
10. [Dữ liệu Khởi tạo & Tài khoản Seed](#-dữ-liệu-khởi-tạo--tài-khoản-seed)
11. [Kiểm thử Tự động (Automated Testing)](#-kiểm-thử-tự-động-automated-testing)
12. [Vận hành & Triển khai Production](#-vận-hành--triển-khai-production)

---

## 🏗 Tổng quan & Kiến trúc Hệ thống

FinWise Backend được xây dựng theo mô hình kiến trúc phân tầng chuẩn mực (*Layered Architecture*), đảm bảo tính module hóa cao, dễ bảo trì, dễ mở rộng và kiểm thử:

```text
[ Client (Zalo Mini App / Web) ]
               │
               ▼
[ Nginx / Cloudflare / Rate Limiter / Helmet / CORS ]
               │
               ▼
[ Route Definitions & Input Sanitization ]
               │
               ▼
[ Zod Request Validation Middleware ]
               │
               ▼
[ Auth & PermissionGuard (RBAC) Middleware ]
               │
               ▼
[ Controller Layer (HTTP Request / Response Formatting) ]
               │
               ▼
[ Service Layer (Business Rules & Domain Invariants) ]
       ├── [ Redis Cache & Distributed Lock (ioredis) ]
       ├── [ AI Provider / Gemini 1.5/2.0 API ]
       ├── [ Cloudflare R2 / S3 Presigned URL Engine ]
       └── [ Background Cron & Worker Jobs ]
               │
               ▼
[ Repository Layer (Prisma Data Access & Raw SQL Aggregations) ]
               │
               ▼
[ PostgreSQL Database (ACID Transactions / Serializable Isolation) ]
```

### 📚 Tài liệu Kỹ thuật Chuyên sâu
*   [Kiến trúc Hệ thống & Sơ đồ ERD](./docs/architecture.md): Mô tả mô hình phân tầng, Mermaid ERD chi tiết, cơ chế Cache, Distributed Lock và Logging.
*   [Tài liệu API chi tiết](./docs/api.md): Mô tả chi tiết định dạng Request/Response, mã lỗi chuẩn `AppError` và JWT Auth flows.
*   [Hướng dẫn Cài đặt & Triển khai](./docs/deployment.md): Hướng dẫn thiết lập môi trường production với Docker Compose, PM2 Cluster và Cloudflare.
*   [Hướng dẫn Upload trực tiếp Cloudflare R2](./docs/r2-direct-upload.md): Cơ chế Presigned URL bảo mật cao để upload chứng từ và hóa đơn.

---

## ⚖️ Nguyên tắc Bất biến Tài chính & Kiến trúc (Invariants)

1. **Bảo toàn Cân bằng Sổ cái (Balance Accounting Invariant)**:
   - Giao dịch `INCOME` tăng số dư ví tương ứng một cách nguyên tử (*Atomic*).
   - Giao dịch `EXPENSE` giảm số dư ví tương ứng một cách nguyên tử.
   - Giao dịch `TRANSFER` chuyển tiền giữa hai ví trong cùng một `Serializable Database Transaction`, không được tính là Thu nhập hay Chi phí.
2. **Khả năng Hoàn tác Đột biến (Mutation Reversibility)**:
   - Khi chỉnh sửa giao dịch, hệ thống tự động hoàn tác (*Rollback/Offset*) ảnh hưởng số dư cũ trước khi áp dụng số dư mới.
   - Khi xóa giao dịch, số dư ví lập tức được hoàn nguyên.
3. **Phân quyền Đa người thuê (Multi-tenant Authorization)**:
   - Tuyệt đối không tin tưởng `userId` truyền từ Client Request Body. `userId` luôn được trích xuất an toàn từ JWT Token đã được ký mật mã.
4. **Bất biến Múi giờ Kinh doanh (Timezone Invariance)**:
   - Toàn bộ chu kỳ tài chính, ngày chốt sổ, báo cáo, và lịch chạy định kỳ được neo cố định theo múi giờ Việt Nam: `Asia/Ho_Chi_Minh` (UTC+7) thông qua module `business-time.ts`.
5. **AI Không Bịa đặt Số liệu (Zero Hallucination Policy)**:
   - Không sử dụng LLM để tính toán số học trực tiếp.
   - AI chỉ đóng vai trò phân tích ngôn ngữ tự nhiên thành Cây cú pháp trừu tượng (AST DSL). Việc tính toán tổng, trung bình, nhóm danh mục hoàn toàn do PostgreSQL/Prisma thực thi bằng thuật toán tất định.

---

## 🧩 Danh mục Tính năng & Các Module Nghiệp vụ

Hệ thống bao gồm 24 modules nghiệp vụ hoàn chỉnh:

1. **Authentication & Session**: Đăng ký, kích hoạt email, đăng nhập JWT kép (Access + Refresh Token qua HTTP-Only Cookie), khôi phục mật khẩu qua SMTP.
2. **Dynamic RBAC & Permissions**: Hệ thống phân quyền động dựa trên Permission (gần 40 permissions chi tiết), bảo vệ chống khóa Admin cuối cùng (*Last-Admin Protection*).
3. **Audit Logging**: Ghi nhận toàn bộ thao tác thêm/sửa/xóa hệ thống với chi tiết diff trước/sau, không thể chỉnh sửa (*Immutable*).
4. **Wallets & Multi-Currency**: Quản lý nhiều loại ví (Tiền mặt, Ngân hàng, Thẻ tín dụng, Đầu tư), quản lý ví mặc định và archive an toàn.
5. **Categories**: Danh mục phân cấp cây Cha - Con không giới hạn tầng, icon SVG tùy biến, phân loại Thu / Chi.
6. **Transactions**: Ghi chép giao dịch, gắn nhãn, địa điểm, đính kèm hóa đơn ảnh/PDF.
7. **Transfers**: Chuyển tiền giữa các ví cùng loại tiền tệ với cam kết giao dịch nguyên tử ACID.
8. **Budgets**: Quản lý hạn mức chi tiêu theo tháng hoặc theo từng danh mục, tính toán tỷ lệ sử dụng theo thời gian thực.
9. **Saving Goals**: Mục tiêu tiết kiệm thông minh, nạp tiền/rút tiền mục tiêu, tự động tính toán thời gian hoàn thành.
10. **Financial Reports**: Báo cáo tài chính chuyên sâu, tỷ lệ tiết kiệm (*Savings Rate*), cơ cấu chi tiêu và xuất dữ liệu.
11. **Cash Flow Runway & Forecaster**: Dự báo dòng tiền tương lai 30/60/90 ngày bằng thuật toán làm mượt hàm mũ (Holt-Winters), tính ngày cạn ngân sách (*Depletion Date*).
12. **What-If Simulation Sandbox**: Mô phỏng kịch bản tài chính giả định (mua nhà, tăng lương, cắt giảm chi phí) và đánh giá va chạm mục tiêu.
13. **Multi-dimensional Anomaly Detection**: Phát hiện giao dịch bất thường trong thời gian thực bằng thuật toán thống kê Modified Z-score (MAD) và tần suất đột biến (*Velocity Bursts*).
14. **Auto Subscription Discovery**: Tự động nhận diện gói thuê bao định kỳ (Netflix, Spotify, Cloud...) dựa trên tính tuần hoàn chu kỳ và phương sai số tiền, hỗ trợ chuyển đổi 1-click sang Nhắc nhở.
15. **Natural Language Query Engine**: Truy vấn tài chính bằng câu hỏi tự nhiên tiếng Việt, chuyển dịch sang AST DSL và tính toán chính xác 100%.
16. **Automated Recurring Transactions**: Lên lịch tạo giao dịch tự động định kỳ, xử lý bù lịch (*Catch-up policy*) và chống trùng lặp bằng Distributed Lock.
17. **Notifications & Worker**: Quản lý thông báo in-app, tích hợp background worker quét định kỳ và gửi thông báo tài chính.
18. **Bill Reminders**: Nhắc nhở hạn nộp hóa đơn, trả nợ định kỳ.
19. **AI Financial Assistant**: Trợ lý AI phân tích thói quen tài chính cá nhân hóa, gợi ý danh mục và kế hoạch chi tiêu.
20. **System Settings & Maintenance Mode**: Bật/tắt chế độ bảo trì hệ thống toàn cục, cấu hình tham số hệ thống động.
21. **AI Administration**: Giám sát lượng Token tiêu thụ, cấu hình Model Gemini, rate-limiting cho tính năng AI.
22. **Developer API Keys**: Quản lý API Key cho bên thứ 3 tích hợp, phân quyền theo scope và rate limit độc lập.
23. **Webhooks Dispatcher**: Bắn sự kiện webhook thời gian thực (HMAC SHA-256 signature) khi có biến động giao dịch hoặc số dư.
24. **Cloudflare R2 Direct Upload**: Sinh Presigned Upload URL cho Client tải trực tiếp ảnh/PDF lên Cloudflare R2 bảo mật.

---

## 📡 Tài liệu API chi tiết (Endpoints Reference)

Tất cả các endpoint đều có tiền tố `/api/v1`.

### 1. System & Health
| Method | Endpoint | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Public | Kiểm tra trạng thái hoạt động (Liveness probe cho Load Balancer) |
| `GET` | `/health/detail` | `SYSTEM_CONFIG_READ` | Kiểm tra chi tiết kết nối Database, Redis, Uptime, Memory |
| `GET` | `/system/public-config` | Public | Lấy cấu hình công khai (Trạng thái bảo trì, thông tin hệ thống) |

### 2. Auth & Session
| Method | Endpoint | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/register` | Public | Đăng ký tài khoản mới |
| `GET` | `/auth/verify-email` | Public | Xác thực email đăng ký |
| `POST` | `/auth/login` | Public | Đăng nhập hệ thống (trả về Access Token và Refresh Token) |
| `POST` | `/auth/refresh` | Public | Làm mới cặp token |
| `POST` | `/auth/logout` | Public | Đăng xuất và vô hiệu hóa phiên |
| `GET` | `/auth/me` | Bearer Token | Lấy thông tin tài khoản và danh sách Permissions hiện tại |
| `PUT` | `/auth/profile` | Bearer Token | Cập nhật thông tin cá nhân |
| `PUT` | `/auth/password` | Bearer Token | Đổi mật khẩu |
| `POST` | `/auth/forgot-password` | Public | Gửi email yêu cầu đặt lại mật khẩu |
| `POST` | `/auth/reset-password` | Public | Đặt lại mật khẩu mới bằng token |
| `GET` | `/auth/sessions` | Bearer Token | Danh sách các phiên thiết bị đang đăng nhập |
| `DELETE` | `/auth/sessions/:id` | Bearer Token | Đăng xuất một phiên cụ thể |

### 3. Users Management (Admin)
| Method | Endpoint | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/users` | `USER_READ` | Danh sách người dùng (tìm kiếm, lọc theo vai trò, phân trang) |
| `GET` | `/users/admin/stats` | `USER_READ` | Thống kê tổng số người dùng, hoạt động, biểu đồ tăng trưởng |
| `GET` | `/users/:id` | `USER_READ` | Chi tiết tài khoản người dùng |
| `POST` | `/users` | `USER_CREATE` | Tạo tài khoản người dùng mới từ trang quản trị |
| `PUT` | `/users/:id` | `USER_UPDATE` | Cập nhật thông tin, kích hoạt/khóa, đổi vai trò Role |
| `DELETE` | `/users/:id` | `USER_DELETE` | Xóa mềm tài khoản |
| `POST` | `/users/:id/restore` | `USER_RESTORE` | Khôi phục tài khoản đã xóa mềm |

### 4. RBAC & Audit Logs
| Method | Endpoint | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/roles` | `ROLE_READ` | Danh sách vai trò người dùng trong hệ thống |
| `POST` | `/roles` | `ROLE_CREATE` | Tạo vai trò tùy biến mới |
| `GET` | `/roles/:id` | `ROLE_READ` | Chi tiết vai trò và các quyền hạn được gán |
| `PUT` | `/roles/:id` | `ROLE_UPDATE` | Cập nhật tên, mô tả vai trò |
| `DELETE` | `/roles/:id` | `ROLE_DELETE` | Xóa vai trò tùy biến (bảo vệ System Roles) |
| `GET` | `/permissions` | `PERMISSION_READ` | Danh mục toàn bộ quyền hạn trong hệ thống |
| `PUT` | `/roles/:id/permissions` | `ROLE_PERMISSION_ASSIGN` | Cập nhật danh sách quyền cho vai trò |
| `GET` | `/audit-logs` | `AUDIT_LOG_READ` | Xem nhật ký kiểm toán hệ thống (lọc theo người thao tác, hành động, ngày) |

### 5. Wallets & Transfers
| Method | Endpoint | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/wallets` | `WALLET_READ` | Danh sách ví cá nhân và tổng số dư khả dụng |
| `POST` | `/wallets` | `WALLET_CREATE` | Tạo ví mới |
| `GET` | `/wallets/:id` | `WALLET_READ` | Chi tiết ví và lịch sử biến động số dư |
| `PUT` | `/wallets/:id` | `WALLET_UPDATE` | Cập nhật thông tin ví |
| `PATCH` | `/wallets/:id/default` | `WALLET_UPDATE` | Đặt làm ví mặc định |
| `PATCH` | `/wallets/:id/restore` | `WALLET_UPDATE` | Khôi phục ví đã archive |
| `DELETE` | `/wallets/:id` | `WALLET_DELETE` | Lưu trữ (Archive) ví |
| `GET` | `/transfers` | `TRANSFER_READ` | Lịch sử chuyển tiền giữa các ví |
| `POST` | `/transfers` | `TRANSFER_CREATE` | Thực hiện chuyển tiền giữa 2 ví cùng loại tiền tệ |
| `DELETE` | `/transfers/:id` | `TRANSFER_DELETE` | Hoàn tác giao dịch chuyển tiền |

### 6. Categories & Transactions
| Method | Endpoint | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/categories` | `CATEGORY_READ` | Danh sách danh mục hệ thống và danh mục cá nhân |
| `GET` | `/categories/tree` | `CATEGORY_READ` | Cấu trúc cây danh mục Cha - Con |
| `POST` | `/categories` | `CATEGORY_CREATE` | Tạo danh mục mới |
| `PUT` | `/categories/:id` | `CATEGORY_UPDATE` | Sửa danh mục cá nhân |
| `DELETE` | `/categories/:id` | `CATEGORY_DELETE` | Archive danh mục |
| `GET` | `/transactions` | `TRANSACTION_READ` | Danh sách giao dịch (lọc theo ví, danh mục, ngày, loại thu/chi) |
| `POST` | `/transactions` | `TRANSACTION_CREATE` | Tạo giao dịch thu/chi và tự động cân chỉnh số dư ví |
| `GET` | `/transactions/:id` | `TRANSACTION_READ` | Xem chi tiết một giao dịch |
| `PUT` | `/transactions/:id` | `TRANSACTION_UPDATE` | Sửa giao dịch và cập nhật số dư nguyên tử |
| `DELETE` | `/transactions/:id` | `TRANSACTION_DELETE` | Xóa giao dịch và hoàn nguyên số dư |

### 7. Smart Financial Engines (Forecast, Simulations, Anomalies, Subscriptions, Query)
| Method | Endpoint | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/forecast` | `FORECAST_READ` | Dự báo Runway tài chính và ngày cạn ngân sách theo 30/60/90 ngày |
| `POST` | `/simulations` | `SIMULATION_EXECUTE` | Chạy mô phỏng kịch bản tài chính What-If và phân tích va chạm mục tiêu |
| `GET` | `/anomalies` | `ANOMALY_READ` | Danh sách giao dịch bất thường được phát hiện |
| `POST` | `/anomalies/check` | `ANOMALY_EVALUATE` | Kiểm tra độ bất thường của một giao dịch giả định thời gian thực |
| `GET` | `/subscriptions` | `SUBSCRIPTION_READ` | Danh sách dịch vụ định kỳ được tự động phát hiện |
| `POST` | `/subscriptions/:id/convert-to-reminder` | `SUBSCRIPTION_MANAGE` | Chuyển gói thuê bao thành Lịch nhắc nhở 1-click |
| `POST` | `/query` | `QUERY_EXECUTE` | Truy vấn ngôn ngữ tự nhiên tiếng Việt, trả về kết quả tất định từ DB |
| `GET` | `/recurring-transactions` | `RECURRING_TRANSACTION_READ` | Danh sách lịch giao dịch tự động định kỳ |
| `POST` | `/recurring-transactions` | `RECURRING_TRANSACTION_CREATE` | Tạo lịch giao dịch định kỳ mới |
| `PATCH` | `/recurring-transactions/:id/pause` | `RECURRING_TRANSACTION_UPDATE` | Tạm dừng lịch giao dịch |
| `PATCH` | `/recurring-transactions/:id/resume` | `RECURRING_TRANSACTION_UPDATE` | Kích hoạt lại lịch giao dịch |
| `GET` | `/recurring-transactions/:id/preview` | `RECURRING_TRANSACTION_READ` | Xem trước các ngày sẽ phát sinh giao dịch tiếp theo |

### 8. Admin Control Center (Settings, AI Admin, Notifications Admin, Integrations)
| Method | Endpoint | Quyền | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/admin/settings` | `SYSTEM_CONFIG_READ` | Lấy toàn bộ tham số cấu hình hệ thống |
| `PUT` | `/admin/settings` | `SYSTEM_CONFIG_UPDATE` | Cập nhật cấu hình tham số hệ thống |
| `POST` | `/admin/settings/maintenance` | `MAINTENANCE_MODE_UPDATE` | Bật/tắt chế độ bảo trì hệ thống |
| `GET` | `/admin/notifications/templates` | `NOTIFICATION_TEMPLATE_READ` | Danh sách mẫu thông báo hệ thống |
| `POST` | `/admin/notifications/broadcast` | `NOTIFICATION_ADMIN_READ` | Gửi thông báo broadcast tới toàn bộ người dùng |
| `GET` | `/admin/ai/usage` | `AI_USAGE_READ` | Thống kê số lượng request và Token AI tiêu thụ |
| `PUT` | `/admin/ai/config` | `AI_CONFIG_UPDATE` | Cấu hình tham số mô hình AI, prompt và toggle tính năng |
| `GET` | `/api-keys` | `API_KEY_READ` | Danh sách API Keys tích hợp |
| `POST` | `/api-keys` | `API_KEY_CREATE` | Tạo mới API Key |
| `DELETE` | `/api-keys/:id` | `API_KEY_DELETE` | Thu hồi API Key |
| `GET` | `/webhooks` | `WEBHOOK_READ` | Danh sách cấu hình Webhooks |
| `POST` | `/webhooks` | `WEBHOOK_CREATE` | Tạo endpoint nhận Webhook sự kiện |
| `POST` | `/webhooks/:id/test` | `WEBHOOK_TEST` | Gửi payload thử nghiệm tới webhook endpoint |
| `POST` | `/uploads/presigned-url` | `UPLOAD_FILE` | Lấy Presigned URL để upload trực tiếp ảnh/hóa đơn lên Cloudflare R2 |

---

## 🛠 Công nghệ sử dụng

| Phân loại | Công nghệ | Phiên bản | Mô tả |
| :--- | :--- | :--- | :--- |
| **Runtime & Core** | Node.js | `>= 18.x` | Môi trường thực thi JavaScript/TypeScript phía server |
| **Framework** | Express.js | `4.21.2` | Web Framework hiệu năng cao cho REST API |
| **Ngôn ngữ** | TypeScript | `5.7.2` | Type-safety tuyệt đối trên toàn bộ source code |
| **Database & ORM** | PostgreSQL & Prisma | `5.22.0` | Cơ sở dữ liệu quan hệ ACID & Type-safe ORM Client |
| **Caching & Locking** | Redis & ioredis | `6.0.0` | Bộ nhớ đệm phân tán và khóa ghi cạnh tranh (Distributed Lock) |
| **Queue / Worker** | BullMQ | `6.2.0` | Hàng đợi tác vụ bất đồng bộ xử lý định kỳ |
| **Object Storage** | Cloudflare R2 / AWS S3 SDK | `3.1107.0` | Lưu trữ file hóa đơn, chứng từ không giới hạn |
| **AI Integration** | Google Gemini SDK | REST v1beta | Mô hình ngôn ngữ lớn hỗ trợ dịch AST DSL và phân tích tài chính |
| **Security & Auth** | JWT, bcryptjs, Helmet, CORS | Latest | Bảo mật nhiều lớp chống tấn công XSS, CSRF, Brute-force |
| **Testing** | Jest & Supertest | `30.4.2` | Kiểm thử tích hợp tự động toàn diện |

---

## 📁 Cấu trúc thư mục

```text
finwise-miniapp-be/
├── .env.example              # Mẫu biến môi trường
├── Dockerfile                # Cấu hình đóng gói Docker Container
├── docker-compose.yml        # Định nghĩa container PostgreSQL, Redis, Backend API
├── jest.config.ts            # Cấu hình Jest test runner
├── package.json              # Danh sách dependencies và scripts
├── tsconfig.json             # Cấu hình TypeScript compiler
│
├── prisma/
│   ├── schema.prisma         # Database schema (20+ bảng dữ liệu)
│   ├── seed.ts               # Dữ liệu khởi tạo (Roles, Permissions, Danh mục mẫu, Tài khoản demo)
│   └── migrations/           # Lịch sử các bản migration database
│
├── src/
│   ├── app.ts                # Khởi tạo Express, middlewares bảo mật, router
│   ├── server.ts             # Điểm bắt đầu khởi động HTTP server và Worker
│   ├── common/               # Constants, Permissions, Enums, AppError, Business Time helpers
│   ├── config/               # Cấu hình biến môi trường, Database, Redis, Mail, Swagger
│   ├── database/             # Prisma Client instance
│   ├── middlewares/          # Auth, PermissionGuard, MaintenanceGuard, RateLimiter, ErrorHandler
│   ├── routes/               # Tổng hợp và phân phối các nhánh API `/api/v1`
│   └── modules/              # 24 modules nghiệp vụ phân tầng độc lập
│       ├── auth/
│       ├── users/
│       ├── rbac/
│       ├── wallets/
│       ├── categories/
│       ├── transactions/
│       ├── transfers/
│       ├── budgets/
│       ├── saving-goals/
│       ├── reports/
│       ├── forecast/
│       ├── simulations/
│       ├── anomalies/
│       ├── subscriptions/
│       ├── query/
│       ├── recurring-transactions/
│       ├── notifications/
│       ├── reminders/
│       ├── ai-assistant/
│       ├── system-settings/
│       ├── api-keys/
│       ├── webhooks/
│       ├── uploads/
│       └── jobs/
│
└── tests/                    # Bộ kiểm thử tích hợp (Auth, Health, RBAC, Engines...)
```

---

## 💻 Yêu cầu hệ thống

- **Node.js**: Phiên bản `>= 18.0.0` (Khuyến nghị `20.x` LTS).
- **pnpm**: Phiên bản `>= 9.0.0` (`pnpm@9.15.0`).
- **PostgreSQL**: Phiên bản `14.x` hoặc cao hơn.
- **Redis**: Phiên bản `6.0` trở lên (bắt buộc cho Caching, Rate Limiting & Distributed Lock).
- **Docker & Docker Compose** (Tùy chọn nếu muốn chạy database & redis qua container).

---

## 🚀 Hướng dẫn Cài đặt & Khởi chạy

### 1. Cài đặt Dependencies

```bash
pnpm install
```

### 2. Thiết lập Biến Môi trường

Sao chép `.env.example` thành `.env` và cập nhật thông tin kết nối Database/Redis của bạn:

```powershell
# Windows PowerShell
Copy-Item .env.example .env

# Linux / macOS
cp .env.example .env
```

### 3. Khởi chạy Database & Redis (Docker Compose)

Nếu chưa có sẵn PostgreSQL và Redis local, bạn có thể khởi động nhanh bằng Docker:

```bash
docker compose up -d postgres redis
```

### 4. Đồng bộ Schema & Nạp Dữ liệu Mẫu

```bash
# Validate Prisma schema
pnpm exec prisma validate

# Sinh Prisma Client
pnpm run prisma:generate

# Chạy migration database
pnpm run db:migrate:deploy

# Nạp dữ liệu mẫu (Roles, Permissions, Category, Admin User)
pnpm run db:seed
```

### 5. Khởi động Server

**Môi trường Development (Hot reload):**
```bash
pnpm dev
```

**Môi trường Production Build:**
```bash
pnpm build
pnpm start
```

Sau khi khởi động thành công:
- **API Base URL**: `http://localhost:7777/api/v1`
- **Health Check**: `http://localhost:7777/api/v1/health`
- **Swagger Documentation**: `http://localhost:7777/api/docs`

---

## ⚙️ Cấu hình Biến Môi trường (.env)

| Tên biến | Mặc định mẫu | Mục đích |
| :--- | :--- | :--- |
| `PORT` | `7777` | Cổng HTTP Server lắng nghe |
| `DATABASE_URL` | `postgresql://...` | Connection string kết nối cơ sở dữ liệu PostgreSQL |
| `JWT_ACCESS_SECRET` | `change_me_...` | Khóa bí mật ký Access Token |
| `JWT_REFRESH_SECRET` | `change_me_...` | Khóa bí mật ký Refresh Token |
| `JWT_ACCESS_EXPIRES_IN`| `1d` | Thời hạn của Access Token |
| `JWT_REFRESH_EXPIRES_IN`| `7d` | Thời hạn của Refresh Token |
| `REDIS_HOST` | `localhost` | Địa chỉ host của máy chủ Redis |
| `REDIS_PORT` | `7379` / `6379` | Cổng kết nối Redis |
| `REDIS_PASSWORD` | *(Trống)* | Mật khẩu Redis nếu có |
| `REDIS_ENABLED` | `true` | Bật/tắt kết nối Redis |
| `MAIL_HOST` / `MAIL_PORT`| `smtp.gmail.com` / `587` | Cấu hình máy chủ gửi email xác thực/khôi phục |
| `MAIL_USER` / `MAIL_PASS`| `...` | Tài khoản & App Password gửi mail |
| `ALLOWED_ORIGINS` | `http://localhost:...` | Danh sách tên miền được phép gọi CORS qua API |
| `R2_ACCOUNT_ID` | `...` | Cloudflare Account ID lưu trữ hóa đơn |
| `R2_BUCKET_NAME` | `finwise-uploads` | Tên Bucket Cloudflare R2 |
| `R2_ACCESS_KEY_ID` | `...` | Access Key ID của Cloudflare R2 Token |
| `R2_SECRET_ACCESS_KEY` | `...` | Secret Access Key của Cloudflare R2 Token |
| `GEMINI_API_KEYS` | `...` | Danh sách API Keys Google Gemini (ngăn cách bằng dấu phẩy) |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Model AI mặc định xử lý truy vấn & tư vấn |

---

## 👥 Dữ liệu Khởi tạo & Tài khoản Seed

Khi chạy lệnh `pnpm run db:seed`, hệ thống sẽ tự động khởi tạo toàn bộ Permissions, các System Roles (`SUPER_ADMIN`, `ADMIN`, `MANAGER`, `USER`), danh mục tài chính mặc định và các tài khoản thử nghiệm sau:

| Vai trò | Email đăng nhập | Mật khẩu mặc định |
| :--- | :--- | :--- |
| `ADMIN` (Super Admin) | `admin@finwise.local` | `Admin@123456` |
| `MANAGER` (Quản lý) | `manager@finwise.local` | `Manager@123456` |
| `USER` (Người dùng) | `user@finwise.local` | `User@123456` |

> ⚠️ **Lưu ý bảo mật**: Các tài khoản trên chỉ phục vụ cho môi trường phát triển và kiểm thử cục bộ. Vui lòng đổi mật khẩu hoặc xóa bỏ khi triển khai lên môi trường Production.

---

## 🧪 Kiểm thử Tự động (Automated Testing)

Hệ thống được trang bị bộ kiểm thử tích hợp (Integration Tests) hoàn chỉnh bằng **Jest** và **Supertest**, bao phủ toàn bộ luồng nghiệp vụ quan trọng:

```bash
# Chạy toàn bộ test suites
pnpm test

# Chạy test và xuất báo cáo độ phủ (Coverage Report)
pnpm run test:cov

# Chạy test ở chế độ theo dõi thay đổi (Watch Mode)
pnpm run test:watch
```

---

## 🚢 Vận hành & Triển khai Production

### 1. Triển khai với Docker Compose

```bash
# Build và khởi chạy toàn bộ dịch vụ (App, DB, Redis)
docker compose up -d --build
```

### 2. Triển khai với PM2 Cluster

```bash
# Build mã nguồn TypeScript
pnpm build

# Khởi động với PM2
pm2 start dist/server.js -i max --name "finwise-backend"
```
