# Bộ nhớ và quy tắc làm việc của dự án

Thư mục này tách phần hướng dẫn chi tiết khỏi `AGENTS.md` để dễ đọc và chỉnh sửa.
`AGENTS.md` ở root vẫn là điểm vào được Codex tự động phát hiện.

```text
.
├── AGENTS.md                    # Hướng dẫn chính, Codex tự đọc
└── .agents/
    ├── README.md                # Sơ đồ và cách bảo trì
    ├── project.md               # Bản đồ dự án
    ├── memory.md                # Sự thật/quyết định dài hạn
    ├── local.md.example         # Mẫu ghi chú riêng theo máy
    ├── rules/
    │   ├── architecture.md      # Ranh giới các layer/module
    │   ├── tech-defaults.md     # Quy ước TypeScript, Express, Prisma
    │   └── workflow.md          # Quy trình sửa và kiểm tra
    └── checklists/
        ├── new-module.md         # Checklist thêm module API
        └── review.md             # Checklist review thay đổi
```

## Cách chỉnh sửa

- Quy tắc áp dụng cho mọi công việc: đặt trong `AGENTS.md`.
- Mô tả cấu trúc thực tế: cập nhật `project.md`.
- Quyết định đã thống nhất và còn hiệu lực: cập nhật `memory.md`.
- Quy tắc chuyên sâu: cập nhật file phù hợp trong `rules/`.
- Ghi chú cá nhân hoặc lệnh riêng theo máy: copy `local.md.example` thành
  `local.md`. File này đã được ignore.

Giữ tài liệu ngắn và có thể hành động. Không lưu secret, token, mật khẩu, dữ liệu
khách hàng hoặc nội dung của `.env` trong thư mục này.

