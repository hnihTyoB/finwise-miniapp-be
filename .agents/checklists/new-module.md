# Checklist thêm module API

- [ ] Xác định endpoint, actor, quyền truy cập và response/error contract.
- [ ] Tạo DTO/type cho input/output.
- [ ] Tạo Zod schema cho body/query/params.
- [ ] Tạo repository chứa Prisma query và lọc field nhạy cảm.
- [ ] Tạo service chứa business rule và transaction boundary.
- [ ] Tạo controller chỉ xử lý HTTP.
- [ ] Tạo route với đúng thứ tự auth, role, validation, controller.
- [ ] Mount route ở `src/routes/index.ts`.
- [ ] Dùng `AppError` + `ERROR_CODE` cho expected failure.
- [ ] Kiểm tra ownership, soft delete, pagination và concurrency nếu liên quan.
- [ ] Cập nhật Swagger/README khi public API thay đổi.
- [ ] Chạy build và các kiểm tra Prisma phù hợp.
- [ ] Thêm test khi dự án có test framework; ghi rõ nếu hiện chưa thể test.

