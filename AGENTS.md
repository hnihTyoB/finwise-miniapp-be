# FinWise Backend Agent Guide

Tài liệu này là điểm vào chính cho mọi phiên làm việc với Codex trong repository.
Mục tiêu là giữ cách phân tích, triển khai và kiểm tra thay đổi nhất quán.

## Context bắt buộc

Trước khi sửa code:

1. Đọc `.agents/project.md`.
2. Đọc các quy tắc trong `.agents/rules/` có liên quan; với thay đổi code backend,
   tối thiểu đọc cả ba file:
   - `.agents/rules/architecture.md`
   - `.agents/rules/tech-defaults.md`
   - `.agents/rules/workflow.md`
3. Đọc `.agents/memory.md` để biết trạng thái và quyết định dài hạn hiện tại.
4. Nếu có `.agents/local.md`, đọc file đó sau cùng. Đây là ghi chú riêng của máy
   và không được commit.

Code và cấu hình đang chạy là nguồn sự thật cao nhất. Nếu tài liệu khác với code,
hãy nêu sự khác biệt, làm theo yêu cầu hiện tại và cập nhật tài liệu khi thay đổi
đã được xác nhận.

## Nguyên tắc cốt lõi

- Giữ thay đổi đúng phạm vi yêu cầu; không tiện tay refactor phần không liên quan.
- Tôn trọng kiến trúc module hiện tại:
  `route -> validation -> controller -> service -> repository`.
- Validate dữ liệu ở biên HTTP bằng Zod.
- Controller chỉ xử lý HTTP; business rule thuộc service; Prisma query thuộc
  repository.
- Dùng `AppError` và `ERROR_CODE` cho lỗi nghiệp vụ có chủ đích.
- Không đọc, ghi log, commit hoặc đưa vào phản hồi giá trị bí mật từ `.env`.
- Không sửa trực tiếp `dist/`, `node_modules/` hoặc migration đã được áp dụng.
- Không chạy reset database, xóa dữ liệu hay tạo migration phá hủy nếu chưa có
  yêu cầu và xác nhận rõ ràng.
- Dùng `pnpm` theo `packageManager` trong `package.json`.

## Prisma schema, migration và generated client

- Khi code sử dụng model, field, enum, relation, index hoặc default mới trong
  `schema.prisma`, luôn kiểm tra cả `prisma/migrations/` và generated Prisma
  Client. Không được kết luận “schema đã có nên không cần migration”.
- Mọi thay đổi database chưa có trong migration history phải có migration mới;
  không sửa migration cũ đã được áp dụng.
- Sau thay đổi Prisma, bắt buộc chạy theo thứ tự phù hợp:
  `pnpm exec prisma validate`, `pnpm run prisma:generate`, rồi `pnpm build`.
  Xác nhận generated types thực sự chứa field mới; không chỉ dựa vào một lần
  build thành công vì TypeScript hoặc IDE có thể đang resolve client khác/stale.
- Nếu database local đã được đồng bộ bằng `db push` nhưng migration history còn
  thiếu, tạo migration cho môi trường mới mà không reset hoặc tự ý apply lại lên
  database hiện tại. Báo rõ nhu cầu baseline/`migrate resolve` nếu có.
- Nếu migration diff kéo theo thao tác phá hủy hoặc thay đổi ngoài phạm vi, không
  đưa chúng vào âm thầm. Chỉ tạo migration an toàn đúng phạm vi hoặc dừng để xin
  xác nhận, đồng thời ghi rõ migration debt còn lại.

## Hoàn tất công việc

- Kiểm tra diff để không ghi đè thay đổi có sẵn của người dùng.
- Chạy kiểm tra phù hợp theo `.agents/rules/workflow.md`.
- Nêu rõ file đã đổi, kiểm tra đã chạy và hạn chế còn lại.
- Khi một quyết định kiến trúc hoặc trạng thái dự án bền vững thay đổi, cập nhật
  `.agents/memory.md`; không biến file này thành nhật ký từng phiên.

## Code review

- Ưu tiên lỗi correctness, security, phân quyền, validation, rò rỉ dữ liệu nhạy
  cảm, tính nhất quán transaction và migration.
- Mỗi nhận xét phải chỉ ra file/vị trí, tác động và hướng sửa an toàn.
- Không báo lỗi chỉ mang tính format nếu formatter có thể xử lý tự động.
