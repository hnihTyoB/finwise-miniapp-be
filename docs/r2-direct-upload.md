# Direct browser upload lên Cloudflare R2

## Phạm vi hiện tại

Luồng presigned PUT hiện phục vụ **avatar**. Frontend không gửi file avatar qua backend:

1. Browser gọi `POST /api/v1/uploads/presign` bằng phiên đăng nhập hiện tại.
2. Backend kiểm tra purpose, MIME type và kích thước khai báo, tự sinh object key rồi ký URL ngắn hạn.
3. Browser `PUT` file trực tiếp tới S3 API domain của R2 với đúng header `Content-Type` mà API trả về.
4. Khi PUT thành công, frontend gửi `publicUrl` trong `PUT /api/v1/auth/profile`.

R2 credentials chỉ tồn tại ở backend. Presigned URL là bearer credential ngắn hạn, không log hoặc lưu URL này.

Hóa đơn giao dịch cũng được lưu trong R2 dưới prefix riêng tư `receipts/<userId>/`, nhưng binary
đi qua endpoint giao dịch có xác thực để backend kiểm tra chữ ký file và ownership. Hóa đơn không
dùng public URL; `GET /transactions/:id/receipt` đọc object sau khi kiểm tra giao dịch thuộc người dùng.
Các key local cũ vẫn được đọc tương thích từ `RECEIPT_UPLOAD_DIR`.

## Cấu hình backend

Các biến cần thiết được liệt kê trong `.env.example`:

- `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_BASE_URL`: public `r2.dev` URL hoặc custom domain dùng để hiển thị avatar
- `R2_PRESIGNED_URL_EXPIRES_IN_SECONDS`: mặc định 300 giây
- `R2_AVATAR_MAX_FILE_SIZE_MB`: mặc định 5 MB

API token R2 chỉ cần quyền ghi đúng bucket được dùng cho upload.

## CORS bắt buộc trên R2 bucket

Thay các origin bằng origin thật của Mini App và môi trường local:

```json
[
  {
    "AllowedOrigins": [
      "https://your-mini-app-origin.example",
      "http://localhost:2999",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Nếu thiếu CORS, URL vẫn ký hợp lệ nhưng browser sẽ chặn request. Client phải gửi chính xác
`requiredHeaders` do endpoint presign trả về.

## Quy ước khi mở rộng upload sau này

- Thêm purpose cụ thể vào allowlist; không biến endpoint thành nơi nhận object key tùy ý từ client.
- Mỗi purpose phải có prefix theo ownership, MIME allowlist, giới hạn kích thước và TTL riêng.
- File công khai (như avatar) có thể dùng `publicUrl`; hóa đơn/tài liệu riêng tư phải giữ bucket private và đọc bằng API hoặc presigned GET có kiểm tra ownership.
- Chỉ lưu URL/key nghiệp vụ sau khi PUT thành công. Cần thêm cơ chế xác nhận object (HEAD) nếu use case có yêu cầu toàn vẹn cao.
- `fileSize` hiện là dữ liệu client khai báo, giúp chặn lỗi thông thường nhưng không phải quota cưỡng chế tuyệt đối của R2 presigned PUT. Với file lớn hoặc quota nghiêm ngặt, bổ sung bước xác nhận server-side và dọn object vi phạm.
- Có kế hoạch xóa object cũ và object mồ côi khi người dùng thay file nhưng không hoàn tất bước lưu nghiệp vụ.
