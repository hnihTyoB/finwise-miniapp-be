# Quy ước kỹ thuật mặc định

## TypeScript

- Giữ `strict` và tránh thêm `any`; nếu thư viện buộc phải dùng, cô lập và giải
  thích ở phạm vi nhỏ nhất.
- Ưu tiên type/interface rõ ràng ở biên module.
- Không dùng type assertion để bỏ qua validation hoặc nullability nếu có thể kiểm
  tra đúng tại runtime.
- Theo style hiện tại: single quote, semicolon, trailing comma ở multiline.

## Express và API

- Response thành công giữ shape nhất quán: `{ success: true, ... }`.
- Error đi qua `errorMiddleware` và có `message`, `code`.
- Route mới phải xác định rõ public hay cần `authMiddleware`/`requireRole`.
- Không tin dữ liệu từ `req.body`, `req.query`, `req.params` trước validation.
- Không ghi access token, refresh token, password hay cookie nhạy cảm vào log.

## Auth và security

- Hash password bằng primitive hiện có; không lưu hoặc trả password plaintext.
- Kiểm tra ownership/role ở server, không dựa vào client.
- Secret chỉ lấy từ environment/config; không hard-code secret mới.
- Với thay đổi token/cookie/CORS/rate limit, kiểm tra cả luồng login, refresh,
  logout và failure path.

## Prisma

- Query nằm ở repository.
- Dùng `$transaction` cho các write phụ thuộc nhau.
- Cân nhắc pagination và index cho endpoint dạng danh sách.
- Select/omit field nhạy cảm một cách chủ động.
- Chạy validate/generate phù hợp khi sửa `schema.prisma`.

## Dependency và generated output

- Không thêm production dependency nếu thư viện hiện có hoặc Node.js built-in đã
  đáp ứng rõ ràng.
- Không sửa `dist/`, `node_modules/` hoặc generated Prisma Client.
- Khi thêm env var, cập nhật `.env.example` bằng placeholder an toàn và cập nhật
  config validation/access tương ứng; không sao chép giá trị từ `.env`.

