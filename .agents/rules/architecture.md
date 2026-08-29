# Quy tắc kiến trúc

## Ranh giới layer

### Route

- Khai báo HTTP method/path và thứ tự middleware.
- Áp dụng auth, role và validation trước controller.
- Không chứa business logic hoặc Prisma query.

### Validation

- Dùng Zod cho body/query/params có dữ liệu cần kiểm tra.
- Normalize/coerce dữ liệu tại schema khi phù hợp.
- DTO phải phản ánh dữ liệu sau validation, tránh cast che lỗi kiểu.

### Controller

- Đọc request đã validate, gọi service và tạo HTTP response.
- Chuyển lỗi cho error middleware; không lặp lại mapping lỗi ở từng controller.
- Không query Prisma, hash password hoặc thực thi business rule.

### Service

- Chứa use case, business rule, authorization theo dữ liệu và điều phối nhiều
  repository/service.
- Dùng `AppError` + `ERROR_CODE` cho lỗi dự kiến.
- Dùng transaction khi nhiều database write phải thành công hoặc thất bại cùng
  nhau.

### Repository

- Là nơi duy nhất trong module thực hiện Prisma query.
- Không tạo HTTP response hoặc phụ thuộc Express.
- Mặc định loại record soft-deleted khi nghiệp vụ yêu cầu dữ liệu đang hoạt động.
- Chỉ trả các field cần thiết; không làm rò `password`, token hay dữ liệu nhạy cảm.

## Thêm module mới

- Theo naming hiện tại:
  `<name>.route.ts`, `<name>.validation.ts`, `<name>.controller.ts`,
  `<name>.service.ts`, `<name>.repository.ts`, `<name>.dto.ts`.
- Mount route ở `src/routes/index.ts`.
- Dùng checklist `.agents/checklists/new-module.md`.

## Database

- Thay đổi schema phải xem xét migration, index, unique constraint, quan hệ và
  `onDelete`.
- Không sửa migration cũ đã chia sẻ; tạo migration mới.
- Không chạy `db:migrate:reset` nếu người dùng chưa yêu cầu rõ ràng.
- Với tiền tệ, giữ Prisma `Decimal`; không âm thầm chuyển sang JavaScript float.

