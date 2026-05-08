import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit, OnDestroy {
  loginForm: FormGroup;
  isLoading = false;
  hidePassword = true;
  banType: 'temporary' | 'permanent' | null = null;
  banMessage = '';
  banCountdownText = '';
  private banCountdownInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private auth: AuthService,
    private snackBar: MatSnackBar
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  onSubmit() {
    if (this.loginForm.valid) {
      this.isLoading = true;
      this.auth.login(
        this.loginForm.value.email,
        this.loginForm.value.password
      ).subscribe({
        next: () => {
          this.isLoading = false;
          this.clearBanNotice();
          const user = this.auth.getUser();
          this.router.navigate(user?.role === 'admin' ? ['/admin'] : ['/home']);
        },
        error: (err) => {
          this.isLoading = false;
          this.showBanAwareError(err?.error);
        }
      });
    }
  }

  goToRegister() {
    this.router.navigate(['/register']);
  }

  forgotPassword() {
    this.snackBar.open('Tính năng quên mật khẩu sẽ được triển khai sau', 'Đóng', { duration: 3000 });
  }

  ngOnInit(): void {
    const notice = this.auth.consumeBanNotice();
    if (!notice) return;

    if (notice.banType === 'permanent') {
      this.banType = 'permanent';
      this.banMessage = 'Bạn đã bị cấm khỏi nền tảng';
      this.banCountdownText = '';
      return;
    }

    this.banType = 'temporary';
    this.banMessage = 'Tài khoản đang bị cảnh cáo';
    if (Number(notice.remainingMs) > 0) {
      this.startTemporaryBanCountdown(Number(notice.remainingMs));
      return;
    }

    if (notice.bannedUntil) {
      const ms = new Date(notice.bannedUntil).getTime() - Date.now();
      if (ms > 0) {
        this.startTemporaryBanCountdown(ms);
      }
    }
  }

  ngOnDestroy(): void {
    this.clearBanCountdown();
  }

  private showBanAwareError(errorBody: any) {
    const payload = errorBody?.error && typeof errorBody.error === 'object' ? errorBody.error : errorBody;

    if (payload?.banType === 'permanent') {
      this.clearBanCountdown();
      this.banType = 'permanent';
      this.banMessage = 'Bạn đã bị cấm khỏi nền tảng';
      this.banCountdownText = '';
      return;
    }

    if (payload?.banType === 'temporary' && Number(payload?.remainingMs) > 0) {
      this.banType = 'temporary';
      this.banMessage = 'Tài khoản đang bị cảnh cáo';
      this.startTemporaryBanCountdown(Number(payload.remainingMs));
      return;
    }

    this.clearBanCountdown();
    this.clearBanNotice();
    this.snackBar.open(payload?.error || 'Đăng nhập thất bại', 'Đóng', { duration: 3000 });
  }

  private startTemporaryBanCountdown(initialRemainingMs: number) {
    this.clearBanCountdown();
    let remainingMs = Math.max(0, initialRemainingMs);

    const pushMessage = () => {
      const seconds = Math.floor((remainingMs / 1000) % 60);
      const minutes = Math.floor((remainingMs / (1000 * 60)) % 60);
      const hours = Math.floor((remainingMs / (1000 * 60 * 60)) % 24);
      const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
      const dd = days > 0 ? `${days} ngày ` : '';
      const hh = String(hours).padStart(2, '0');
      const mm = String(minutes).padStart(2, '0');
      const ss = String(seconds).padStart(2, '0');
      this.banCountdownText = `${dd}${hh}:${mm}:${ss}`;
    };

    pushMessage();
    this.banCountdownInterval = setInterval(() => {
      remainingMs -= 1000;
      if (remainingMs <= 0) {
        this.clearBanCountdown();
        this.clearBanNotice();
        return;
      }
      pushMessage();
    }, 1000);
  }

  private clearBanCountdown() {
    if (this.banCountdownInterval) {
      clearInterval(this.banCountdownInterval);
      this.banCountdownInterval = null;
    }
  }

  private clearBanNotice() {
    this.banType = null;
    this.banMessage = '';
    this.banCountdownText = '';
  }
}
