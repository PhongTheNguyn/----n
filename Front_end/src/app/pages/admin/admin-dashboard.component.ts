import { Component, OnInit } from '@angular/core';
import { AdminService, DashboardStats } from '../../services/admin.service';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatProgressSpinnerModule],
  template: `
    <h1>Tổng quan</h1>
    <p class="sub">Số liệu hệ thống theo thời gian thực</p>
    <div *ngIf="loading" class="loading">
      <mat-spinner diameter="48"></mat-spinner>
    </div>
    <div *ngIf="!loading && stats" class="stats-grid">
      <mat-card class="stat-card">
        <mat-card-header>
          <mat-card-title>Người dùng</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <span class="stat-value">{{ stats.totalUsers }}</span>
        </mat-card-content>
      </mat-card>
      <mat-card class="stat-card">
        <mat-card-header>
          <mat-card-title>Báo cáo hôm nay</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <span class="stat-value">{{ stats.reportsToday }}</span>
        </mat-card-content>
      </mat-card>
      <mat-card class="stat-card">
        <mat-card-header>
          <mat-card-title>Tổng báo cáo</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <span class="stat-value">{{ stats.totalReports }}</span>
        </mat-card-content>
      </mat-card>
      <mat-card class="stat-card">
        <mat-card-header>
          <mat-card-title>Chờ xử lý</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <span class="stat-value highlight">{{ stats.pendingReports }}</span>
        </mat-card-content>
      </mat-card>
      <mat-card class="stat-card">
        <mat-card-header>
          <mat-card-title>Phiên gọi</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <span class="stat-value">{{ stats.totalSessions }}</span>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [
    `
      h1 { margin: 0 0 4px; color: #111827; }
      .sub { margin: 0 0 20px; color: #4b5563; }
      .loading { padding: 48px; display: flex; justify-content: center; }
      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 16px;
      }
      .stat-card {
        background: rgba(247, 248, 252, 0.96);
        border-radius: 20px;
        box-shadow: 0 14px 32px rgba(0,0,0,0.16);
      }
      .stat-value { font-size: 2rem; font-weight: 700; color: #111827; }
      .stat-value.highlight { color: #ef4444; }
      mat-card-content { padding-top: 8px; }
    `
  ]
})
export class AdminDashboardComponent implements OnInit {
  stats: DashboardStats | null = null;
  loading = true;

  constructor(private admin: AdminService) {}

  ngOnInit() {
    this.admin.getDashboardStats().subscribe({
      next: (s) => {
        this.stats = s;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }
}
