# Quy trình làm việc

## 1. Trước khi sửa

- Chạy `git status --short` và giữ nguyên thay đổi không liên quan của người dùng.
- Đọc entry point, module liên quan, Prisma schema và config cần thiết.
- Tóm tắt phạm vi cùng giả định quan trọng trước thay đổi lớn.

## 2. Khi triển khai

- Tạo thay đổi nhỏ, tập trung và theo kiến trúc hiện tại.
- Không refactor ngoài phạm vi chỉ để làm đẹp.
- Khi hành vi API đổi, cập nhật route/validation/DTO/Swagger hoặc README có liên
  quan nếu chúng đang mô tả hành vi đó.
- Khi schema đổi, thêm migration mới và kiểm tra tác động dữ liệu.

## 3. Verification

Chọn kiểm tra tương ứng với thay đổi:

```bash
pnpm build
pnpm exec prisma validate
pnpm run prisma:generate
```

- Luôn ưu tiên `pnpm build` cho thay đổi TypeScript.
- Chạy `prisma validate` khi sửa schema, seed hoặc database config.
- Chạy generate khi Prisma schema làm thay đổi client types.
- Chỉ chạy `pnpm lint` khi ESLint config đã tồn tại và hoạt động.
- Hiện chưa có test suite; không tuyên bố “tests pass” nếu chỉ build thành công.
- Không chạy migration reset hoặc seed lên database không xác định.

## 4. Trước khi bàn giao

- Xem lại `git diff --check`, `git diff` và `git status --short`.
- Kiểm tra không có `.env`, secret, generated output hoặc file ngoài phạm vi bị
  đưa vào diff.
- Báo ngắn gọn: kết quả, file chính, verification đã chạy và phần chưa kiểm tra.
- Cập nhật `.agents/memory.md` nếu có quyết định dài hạn mới.

