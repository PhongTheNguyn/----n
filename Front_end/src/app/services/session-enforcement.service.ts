import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Router } from '@angular/router';
import { getWsUrl } from '../core/api-config';
import { AuthService, BanNotice } from './auth.service';

@Injectable({ providedIn: 'root' })
export class SessionEnforcementService {
  private socket: Socket | null = null;

  constructor(
    private auth: AuthService,
    private router: Router
  ) {}

  ensureConnection(): void {
    const token = this.auth.getToken();
    if (!token) {
      this.socket?.disconnect();
      this.socket = null;
      return;
    }
    if (this.socket?.connected) return;

    this.socket = io(getWsUrl(), {
      auth: { token }
    });

    this.socket.on('account-banned', (data: BanNotice) => {
      const notice: BanNotice = {
        banType: data?.banType === 'permanent' ? 'permanent' : 'temporary',
        message: data?.message || (data?.banType === 'permanent' ? 'Bạn đã bị cấm khỏi nền tảng' : 'Tài khoản đang bị cảnh cáo'),
        bannedUntil: data?.bannedUntil || null,
        remainingMs: Number(data?.remainingMs) || 0
      };
      this.auth.setBanNotice(notice);
      this.auth.logout();
      this.router.navigate(['/login']);
    });
  }
}
