# Hướng dẫn Cài đặt và Triển khai Hệ thống FinWise Backend

Tài liệu này cung cấp hướng dẫn cài đặt từ môi trường phát triển (Development) cục bộ cho đến môi trường vận hành thực tế (Production) có container hoá.

---

## 1. Yêu cầu Hệ thống tối thiểu

*   **Node.js**: Phiên bản 18.x trở lên.
*   **Package Manager**: `pnpm` phiên bản 9.x trở lên.
*   **Database**: PostgreSQL 15.x trở lên.
*   **Cache & Session**: Redis 7.x trở lên.
*   **Docker & Docker Compose**: Nếu triển khai bằng Container.

---

## 2. Hướng dẫn Triển khai cục bộ (Local Development)

### Bước 2.1: Tải mã nguồn và Cài đặt thư viện phụ thuộc
Sử dụng `pnpm` để cài đặt dependencies theo chuẩn cấu hình `package.json`:
```bash
pnpm install
```

### Bước 2.2: Cấu hình biến môi trường
1.  Sao chép file cấu hình mẫu:
    ```bash
    cp .env.example .env
    ```
2.  Mở file `.env` và cập nhật thông số kết nối Database, Redis và JWT:
    ```env
    NODE_ENV=development
    PORT=7777

    # Kết nối PostgreSQL
    DATABASE_URL="postgresql://postgres:password@localhost:5432/datafinwise?schema=public"

    # Cấu hình Token bảo mật
    JWT_ACCESS_SECRET="your_strong_access_secret_key"
    JWT_REFRESH_SECRET="your_strong_refresh_secret_key"
    JWT_ACCESS_EXPIRES_IN=1d
    JWT_REFRESH_EXPIRES_IN=7d

    # Kết nối Cache Redis
    REDIS_HOST=localhost
    REDIS_PORT=6379
    REDIS_ENABLED=true

    # Dịch vụ AI (Trợ lý Tài chính)
    AI_PROVIDER=gemini
    GEMINI_API_KEYS="key1,key2" # Danh sách khóa xoay vòng ngăn lỗi quota limit
    ```

### Bước 2.3: Chuẩn bị Cơ sở dữ liệu (Prisma setup)
Chạy tuần tự các lệnh sau để kiểm tra cấu trúc schema, sinh kiểu (client types) và cập nhật cơ sở dữ liệu:
```bash
# Validate cấu trúc Prisma schema
pnpm exec prisma validate

# Sinh mã Prisma Client tương thích
pnpm run prisma:generate

# Triển khai các file migration và cập nhật cấu trúc database
pnpm run db:migrate:deploy

# Nạp dữ liệu mẫu demo phong phú (Ví, giao dịch, budget, saving goals mẫu)
pnpm run db:seed
```

### Bước 2.4: Khởi động Server phát triển
```bash
pnpm dev
```
Hệ thống sẽ chạy tại `http://localhost:7777`.

---

## 3. Triển khai Production sử dụng Docker (Khuyến nghị)

FinWise cung cấp file cấu hình Docker tối ưu bảo mật chạy dưới quyền **non-root user** để ngăn chặn leo thang đặc quyền bảo mật.

### Bước 3.1: Build Container Image
Dockerfile multi-stage giúp giảm tối đa dung lượng image và loại bỏ source code TypeScript thừa ở runtime:
```bash
docker build -t finwise-backend:latest .
```

### Bước 3.2: Chạy toàn bộ Stack dịch vụ bằng Docker Compose
File `docker-compose.yml` định nghĩa đầy đủ 3 services chính: `app` (Node.js API), `postgres` (Database), `redis` (Cache).
Đặc biệt, hệ thống sử dụng **Healthchecks** tích hợp để đảm bảo các dịch vụ hạ tầng sẵn sàng trước khi nạp ứng dụng.

Để khởi động toàn bộ hệ thống ở chế độ nền (detached mode):
```bash
docker compose up -d
```

Để theo dõi log hoạt động:
```bash
docker compose logs -f
```

Để dừng hệ thống và bảo lưu dữ liệu (Named volumes):
```bash
docker compose down
```

---

## 4. Triển khai bằng PM2 (Môi trường Linux VPS thông thường)

Nếu không sử dụng Docker trên máy chủ, sử dụng công cụ quản lý tiến trình **PM2** để chạy ngầm và tự động khởi động lại ứng dụng khi gặp sự cố crash.

### Bước 4.1: Cài đặt PM2 toàn cục
```bash
npm install -g pm2
```

### Bước 4.2: Build mã nguồn TypeScript thành Javascript
```bash
pnpm build
```

### Bước 4.3: Khởi động ứng dụng bằng PM2
Tạo file cấu hình `ecosystem.config.js` ở thư mục gốc:
```javascript
module.exports = {
  apps: [
    {
      name: 'finwise-backend',
      script: 'dist/server.js',
      instances: 'max', // Chạy chế độ Cluster tận dụng tối đa số nhân CPU
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
```
Khởi động ứng dụng:
```bash
pm2 start ecosystem.config.js
```

Kiểm tra trạng thái các instances:
```bash
pm2 status
```
