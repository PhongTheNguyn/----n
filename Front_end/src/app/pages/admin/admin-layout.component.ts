import { Component, ViewChild } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
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
    <mat-toolbar color="primary">
      <button mat-icon-button (click)="sidenav?.toggle()">
        <mat-icon>menu</mat-icon>
      </button>
      <span class="spacer"></span>
      <span>Admin Panel</span>
      <span class="spacer"></span>
      <button mat-button routerLink="/home">
        <mat-icon>home</mat-icon>
        Về trang chủ
      </button>
      <button mat-button (click)="logout()">
        <mat-icon>logout</mat-icon>
        Đăng xuất
      </button>
    </mat-toolbar>

    <mat-sidenav-container class="admin-container">
      <mat-sidenav #sidenav mode="side" opened class="admin-sidenav">
        <mat-nav-list>
          <a mat-list-item routerLink="/admin" routerLinkActive="active" [queryParamsHandling]="'preserve'">
            <mat-icon matListItemIcon>dashboard</mat-icon>
            <span matListItemTitle>Dashboard</span>
          </a>
          <a mat-list-item routerLink="/admin/reports" routerLinkActive="active">
            <mat-icon matListItemIcon>flag</mat-icon>
            <span matListItemTitle>Báo cáo</span>
          </a>
          <a mat-list-item routerLink="/admin/sessions" routerLinkActive="active">
            <mat-icon matListItemIcon>phone</mat-icon>
            <span matListItemTitle>Phiên gọi</span>
          </a>
          <a mat-list-item routerLink="/admin/logs" routerLinkActive="active">
            <mat-icon matListItemIcon>list_alt</mat-icon>
            <span matListItemTitle>Nhật ký</span>
          </a>
          <a mat-list-item routerLink="/admin/config" routerLinkActive="active">
            <mat-icon matListItemIcon>settings</mat-icon>
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
      .admin-container { height: calc(100vh - 64px); }
      .admin-sidenav { width: 240px; }
      .admin-content { padding: 24px; }
      .active { background: rgba(0,0,0,0.08); }
    `
  ]
})
export class AdminLayoutComponent {
  @ViewChild('sidenav') sidenav!: MatSidenav;

  constructor(
    private auth: AuthService,
    private router: Router
  ) {}

  logout() {
    this.auth.logout();
  }
}
