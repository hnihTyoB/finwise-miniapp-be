# Bản đồ dự án FinWise Backend

## Mục đích

Backend API cho FinWise, một Zalo Mini App quản lý thu chi và báo cáo tài chính.
Các API đang được mount dưới `/api/v1`; Swagger UI ở `/api/docs`.

## Công nghệ

- Node.js + Express 4 + TypeScript (CommonJS, strict mode)
- Prisma 5 + PostgreSQL
- Zod cho validation
- JWT cho authentication, role middleware cho authorization
- pnpm là package manager chuẩn

## Cấu trúc runtime

```text
src/
├── server.ts             # Nạp env và mở HTTP server
├── app.ts                # Khởi tạo Express và middleware
├── routes/index.ts       # Mount route cấp /api/v1
├── modules/
│   ├── auth/             # Đăng ký, đăng nhập, token, profile, session
│   └── users/            # Quản trị user
├── middlewares/          # Auth, role, validation, rate limit, error
├── config/               # Env, DB, JWT, mail, Swagger
├── database/             # Prisma client
└── common/
    ├── constants/
    ├── errors/
    ├── helpers/
    ├── services/
    └── types/

prisma/
├── schema.prisma         # Database schema
├── migrations/           # Lịch sử migration
└── seed.ts               # Seed data

scripts/prisma-run.js      # Wrapper chạy Prisma với env của dự án
```

## Luồng request chuẩn

```text
Express router
  -> auth/role middleware (khi cần)
  -> Zod validation
  -> controller
  -> service
  -> repository
  -> Prisma/PostgreSQL
  -> response hoặc error middleware
```

## Phạm vi hiện tại

- Route hoạt động: health, auth, users, wallets, categories, transactions, transfers, budgets,
  saving goals, financial reports và AI Financial Assistant.
- Wallet, Category, Transaction, Transfer và Budget có module API theo ownership trong
  `src/modules/`.
- Financial Reports tổng hợp dữ liệu hiện có theo khoảng thời gian và currency,
  không lưu snapshot báo cáo riêng trong database.
- AI Financial Assistant cung cấp phân loại giao dịch, OCR hóa đơn, hỏi đáp tài chính,
  phân tích xu hướng/bất thường và khuyến nghị. Module chỉ đọc dữ liệu thuộc người dùng,
  không lưu hội thoại hoặc kết quả AI và truy cập mô hình qua provider interface.
- Notification cung cấp inbox, trạng thái đã đọc, cấu hình kênh và outbox giao nhận;
  Reminder hỗ trợ lịch một lần hoặc lặp lại và được xử lý bởi worker nền.
- Email verification, password reset, cảnh báo thiết bị và quản lý session nằm
  trong module auth.

## File sinh tự động hoặc không được sửa trực tiếp

- `dist/`
- `node_modules/`
- Prisma Client được generate
- Migration cũ đã được dùng ở môi trường chia sẻ
