# Ứng dụng Video Call Ngẫu nhiên

Ứng dụng web gọi video ngẫu nhiên tương tự Azar. Công nghệ: Angular (Frontend), Node.js + Express (Backend), PostgreSQL, Socket.io, WebRTC.

## Cấu trúc dự án

- `Front_end/` - Angular 17 (Login, Register, Profile, Home với WebRTC)
- `back_end/` - Node.js + Express, Prisma, Socket.io

## Chạy ứng dụng

### 1. Backend

```bash
cd back_end
npm install
```

Tạo database PostgreSQL và cập nhật `back_end/.env`:

```
DATABASE_URL="postgresql://user:password@localhost:5432/app_videocall"
JWT_SECRET=thephong10
```

Chạy migration:

```bash
npx prisma generate
npx prisma db push
```

Khởi động server:

```bash
npm start
```

Backend chạy tại http://localhost:3000

### 2. Frontend

```bash
cd Front_end
npm install
npm start
```

Frontend chạy tại http://localhost:4200 (dùng proxy để gọi API backend).

## Các trang

- `/login` - Đăng nhập
- `/register` - Đăng ký
- `/profile` - Chỉnh sửa hồ sơ (cần đăng nhập)
- `/home` - Ghép cặp video call (cần đăng nhập)
