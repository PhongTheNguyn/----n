# 🚀 HƯỚNG DẪN CHẠY ỨNG DỤNG

## Yêu cầu hệ thống
- Node.js (phiên bản 18 trở lên)
- npm (đi kèm với Node.js)

## Các bước chạy ứng dụng

### Bước 1: Kiểm tra Node.js đã cài đặt chưa
Mở Terminal/PowerShell và chạy:
```bash
node --version
npm --version
```

Nếu chưa có Node.js, tải và cài đặt từ: https://nodejs.org/

### Bước 2: Cài đặt dependencies
Trong thư mục dự án, chạy lệnh:
```bash
npm install
```

Lệnh này sẽ cài đặt tất cả các package cần thiết (Angular, Angular Material, v.v.)

### Bước 3: Chạy ứng dụng
Sau khi cài đặt xong, chạy:
```bash
npm start
```

Hoặc:
```bash
ng serve
```

### Bước 4: Mở trình duyệt
Ứng dụng sẽ tự động mở tại địa chỉ:
```
http://localhost:4200
```

Nếu không tự động mở, bạn có thể mở trình duyệt và truy cập địa chỉ trên.

## 📱 Các trang trong ứng dụng

- **Trang đăng nhập**: `http://localhost:4200/login`
- **Trang đăng ký**: `http://localhost:4200/register`
- **Trang hồ sơ**: `http://localhost:4200/profile`
- **Trang chính**: `http://localhost:4200/home`

## ⚠️ Lưu ý

- Lần đầu chạy `npm install` có thể mất vài phút để tải các package
- Nếu gặp lỗi port 4200 đã được sử dụng, bạn có thể đổi port bằng cách:
  ```bash
  ng serve --port 4201
  ```
- Để dừng server, nhấn `Ctrl + C` trong terminal

## 🛠️ Troubleshooting

### Lỗi: "ng: command not found"
Giải pháp: Chạy lại `npm install` hoặc cài Angular CLI global:
```bash
npm install -g @angular/cli
```

### Lỗi: "Cannot find module"
Giải pháp: Xóa `node_modules` và `package-lock.json`, sau đó chạy lại:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Lỗi về port đã được sử dụng
Giải pháp: Đổi port khác:
```bash
ng serve --port 4201
```
