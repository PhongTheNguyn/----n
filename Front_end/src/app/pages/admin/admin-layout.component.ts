import { Component, ViewChild } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatListModule } from '@angular/material/list';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatSidenavModule,
    MatListModule,
    MatTooltipModule
  ],
  template: `
    <mat-toolbar color="primary" class="admin-toolbar">
      <button mat-icon-button (click)="sidenav?.toggle()">
        <i class="fi fi-rr-menu-burger"></i>
      </button>
      <span class="toolbar-title">Admin Panel</span>
      <span class="spacer"></span>
      <button mat-button class="toolbar-action" routerLink="/home">
        <i class="fi fi-rr-house-blank"></i>
        Về trang chủ
      </button>
      <button mat-button class="toolbar-action" (click)="logout()">
        <i class="fi fi-rr-sign-out-alt"></i>
        Đăng xuất
      </button>
    </mat-toolbar>

    <mat-sidenav-container class="admin-container">
      <mat-sidenav #sidenav mode="side" opened class="admin-sidenav">
        <mat-nav-list>
          <a mat-list-item routerLink="/admin" routerLinkActive="active" [queryParamsHandling]="'preserve'">
            <i matListItemIcon class="fi fi-rr-apps"></i>
            <span matListItemTitle>Dashboard</span>
          </a>
          <a mat-list-item routerLink="/admin/reports" routerLinkActive="active">
            <i matListItemIcon class="fi fi-rr-flag"></i>
            <span matListItemTitle>Báo cáo</span>
          </a>
          <a mat-list-item routerLink="/admin/sessions" routerLinkActive="active">
            <i matListItemIcon class="fi fi-rr-phone-call"></i>
            <span matListItemTitle>Phiên gọi</span>
          </a>
          <a mat-list-item routerLink="/admin/payments" routerLinkActive="active">
            <i matListItemIcon class="fi fi-rr-wallet"></i>
            <span matListItemTitle>Thanh toán</span>
          </a>
          <a mat-list-item routerLink="/admin/logs" routerLinkActive="active">
            <i matListItemIcon class="fi fi-rr-clipboard-list"></i>
            <span matListItemTitle>Nhật ký</span>
          </a>
          <a mat-list-item routerLink="/admin/config" routerLinkActive="active">
            <i matListItemIcon class="fi fi-rr-settings"></i>
            <span matListItemTitle>Cấu hình</span>
          </a>
        </mat-nav-list>
      </mat-sidenav>
      <mat-sidenav-content class="admin-content">
        <router-outlet></router-outlet>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: [
    `
      .spacer { flex: 1 1 auto; }
      .admin-toolbar {
        box-shadow: 0 10px 30px rgba(15, 18, 33, 0.25);
        background: #ffffff !important;
        backdrop-filter: blur(10px);
        color: #111827;
        border-bottom: 1px solid rgba(15, 23, 42, 0.12);
      }
      .toolbar-title {
        margin-left: 10px;
        font-weight: 700;
        font-size: 20px;
      }
      .toolbar-action {
        border-radius: 12px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: #111827 !important;
      }
      .toolbar-action .fi {
        color: #111827;
        font-size: 16px;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        transform: translateY(1px);
      }
      .admin-container { height: calc(100vh - 64px); background: #f8fafc; }
      .admin-sidenav {
        width: 250px;
        border-right: 1px solid rgba(15, 23, 42, 0.12);
        background: #ffffff;
      }
      .admin-sidenav a[mat-list-item] {
        color: #1f2937;
      }
      .admin-sidenav a[mat-list-item] [matListItemTitle] {
        color: #111827 !important;
      }
      .admin-sidenav a[mat-list-item] .fi {
        color: #111827;
      }
      .admin-content { padding: 24px; }
      .active { background: rgba(91, 103, 241, 0.14); border-radius: 12px; }
      .fi { font-size: 20px; line-height: 1; }

      @media (max-width: 768px) {
        .toolbar-action { min-width: 40px; padding: 0 10px; }
        .toolbar-action:not(:last-child) { margin-right: 4px; }
        .admin-content { padding: 14px; }
      }
    `
  ]
})
export class AdminLayoutComponent {
  @ViewChild('sidenav') sidenav!: MatSidenav;

  constructor(
    private auth: AuthService
  ) {}

  logout() {
    this.auth.logout();
  }
}
