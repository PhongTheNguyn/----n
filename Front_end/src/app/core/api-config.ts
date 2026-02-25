import { environment } from '../../environments/environment';

/**
 * API base URL.
 *
 * - Production (build Vercel): dùng trực tiếp environment.apiUrl
 *   (cần đặt thành URL HTTPS của backend khi bạn deploy backend lên cloud).
 * - Dev / LAN: nếu không phải localhost, dùng http://<hostname>:3000 để gọi backend chạy local.
 */
export function getApiUrl(): string {
  // Production: luôn dùng giá trị cấu hình trong environment.prod.ts
  if (environment.production) {
    return environment.apiUrl || '';
  }

  // Dev: khi mở bằng IP LAN (vd 192.168.x.x), gọi backend tại http://<ip>:3000
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return `http://${window.location.hostname}:3000`;
  }

  // Dev localhost: dùng proxy (/api -> localhost:3000)
  return environment.apiUrl || '';
}

/**
 * WebSocket (Socket.IO) URL.
 *
 * - Production: dùng environment.wsUrl (URL HTTPS backend).
 * - Dev / LAN: nếu không phải localhost, dùng http://<hostname>:3000.
 */
export function getWsUrl(): string {
  if (environment.production) {
    return environment.wsUrl || 'http://localhost:3000';
  }

  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return `http://${window.location.hostname}:3000`;
  }

  return environment.wsUrl || 'http://localhost:3000';
}
