# Checklist review thay đổi

## Correctness

- [ ] Happy path và failure path đúng contract.
- [ ] Dữ liệu đã validate trước khi dùng.
- [ ] Null/optional, pagination, sorting và timezone được xử lý rõ.
- [ ] Nhiều write phụ thuộc nhau nằm trong transaction.

## Security

- [ ] Endpoint có auth/role/ownership phù hợp.
- [ ] Không lộ password, token, secret hoặc field riêng tư.
- [ ] Không tin identifier/role do client tự khai báo.
- [ ] CORS, cookie, JWT và rate limit không bị nới lỏng ngoài chủ ý.

## Database

- [ ] Query tôn trọng soft delete.
- [ ] Migration không phá dữ liệu ngoài chủ ý và có index/constraint phù hợp.
- [ ] Không sửa migration lịch sử đã được dùng.
- [ ] Tiền tệ không bị chuyển sang floating point thiếu chính xác.

## Maintainability

- [ ] Đúng ranh giới route/validation/controller/service/repository.
- [ ] Không có refactor hoặc dependency ngoài phạm vi.
- [ ] Documentation và `.agents/memory.md` phản ánh quyết định bền vững mới.
- [ ] Verification được báo chính xác, không đánh đồng build với test.

