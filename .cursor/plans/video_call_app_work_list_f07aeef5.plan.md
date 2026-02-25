---
name: Video Call App Work List
overview: Danh sách công việc để xây dựng backend (Node.js + PostgreSQL), tích hợp với frontend Angular hiện có và hoàn thiện ứng dụng video call ngẫu nhiên.
todos: []
isProject: false
---

# Danh sách công việc – Ứng dụng Video Call Ngẫu nhiên

## Hiện trạng

- **Frontend**: Angular 17 – 4 trang (Login, Register, Profile, Home), UI đã xong, chưa gọi API
- **Backend**: Chưa có (chưa có folder `back_end`)
- **Database**: Chưa thiết lập

---

## Phase 1: Backend cơ bản

### 1.1 Khởi tạo backend

- Tạo folder `back_end`
- Init project Node.js với `npm init`
- Cài đặt: `express`, `cors`, `dotenv`, `bcryptjs`, `jsonwebtoken`, `pg` (hoặc Prisma), `multer`, `socket.io`
- Cấu trúc thư mục đề xuất:
  ```
  back_end/
  ├── src/
  │   ├── config/       # DB, env
  │   ├── controllers/
  │   ├── routes/
  │   ├── middleware/
  │   ├── services/
  │   └── server.js
  ├── .env
  └── package.json
  ```


### 1.2 PostgreSQL

- Tạo database (local hoặc cloud)
- Thiết kế schema: `users` (id, email, password_hash, display_name, gender, country, age, bio, avatar_url, created_at)
- Dùng Prisma hoặc `pg` thuần để kết nối
- Viết migration / script tạo bảng

---

## Phase 2: API Authentication

### 2.1 Đăng ký (Register)

- `POST /api/auth/register`
- Validate: email (format, unique), password, confirm password, họ tên, giới tính, quốc gia, tuổi, checkbox điều khoản
- Hash mật khẩu (bcrypt)
- Lưu user vào DB, trả về JWT

### 2.2 Đăng nhập (Login)

- `POST /api/auth/login`
- Validate email + password
- So sánh password với hash trong DB
- Trả về JWT

### 2.3 Quên mật khẩu (nếu làm)

- `POST /api/auth/forgot-password` – gửi link reset (có thể bỏ qua lúc đầu)

### 2.4 Middleware auth

- Middleware kiểm tra JWT cho các route protected

---

## Phase 3: API Profile

### 3.1 Lấy profile

- `GET /api/user/profile` – cần JWT

### 3.2 Cập nhật profile

- `PUT /api/user/profile` – cập nhật display_name, gender, country, age, bio

### 3.3 Upload avatar

- `POST /api/user/avatar` – nhận file, lưu (local hoặc S3), cập nhật `avatar_url` trong DB

---

## Phase 4: Matchmaking và WebRTC signaling

### 4.1 WebSocket (Socket.io)

- Cài Socket.io
- Thiết lập server lắng nghe connection

### 4.2 Hàng đợi ghép cặp

- User join queue với filter (gender, country)
- Logic ghép 2 user tương thích khi có đủ người
- Gửi event tới 2 user khi match thành công

### 4.3 Signaling WebRTC

- Event: `offer`, `answer`, `ice-candidate`
- Chuyển tiếp giữa 2 peer trong cùng room
- Event: `skip`, `end-call` để kết thúc và tìm match mới

---

## Phase 5: Tích hợp Frontend với Backend

### 5.1 Cấu hình Angular

- Thêm `HttpClientModule` vào [app.module.ts](Front_end/src/app/app.module.ts)
- Tạo `environment.ts` (API base URL: `http://localhost:3000` hoặc tương tự)
- Cấu hình proxy trong `angular.json` (nếu cần) để tránh CORS

### 5.2 Service layer

- `AuthService`: login, register, logout, lưu/đọc JWT
- `ProfileService`: getProfile, updateProfile, uploadAvatar
- `MatchingService`: kết nối Socket.io, start matching, next, end call

### 5.3 Cập nhật components

- **LoginComponent**: gọi `AuthService.login()`, lưu JWT, redirect
- **RegisterComponent**: gọi `AuthService.register()`
- **ProfileComponent**: load profile qua API, gửi update, upload avatar
- **HomeComponent**: kết nối WebSocket, gọi matching logic thật, xử lý signaling WebRTC

### 5.4 Route guard

- `AuthGuard`: bảo vệ /profile, /home – redirect /login nếu chưa đăng nhập

---

## Phase 6: WebRTC video thật (tùy chọn, có thể làm sau)

- Trong `HomeComponent`: tạo `RTCPeerConnection`
- Lấy stream từ camera, gắn vào `<video>`
- Xử lý offer/answer qua Socket.io
- Kết nối TURN/STUN nếu cần

---

## Thứ tự ưu tiên gợi ý

1. Phase 1 (Backend setup + PostgreSQL)
2. Phase 2 (Auth APIs)
3. Phase 5.1, 5.2, 5.3 cho Auth (Login, Register) và AuthGuard
4. Phase 3 (Profile APIs) + Phase 5 cho Profile
5. Phase 4 (Matchmaking + Socket.io) + Phase 5 cho Home
6. Phase 6 (WebRTC) khi đã ổn định

---

## Công nghệ đề xuất

| Phần | Công nghệ |

|------|-----------|

| Backend | Node.js + Express |

| ORM / DB | Prisma + PostgreSQL |

| Auth | JWT + bcryptjs |

| Realtime | Socket.io |

| File upload | Multer |