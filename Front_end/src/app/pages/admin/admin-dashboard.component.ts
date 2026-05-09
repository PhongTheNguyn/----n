import { Component, OnInit } from '@angular/core';
import { AdminService, DashboardStats } from '../../services/admin.service';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule
  ],
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
      <mat-card class="stat-card">
        <mat-card-header>
          <mat-card-title>Giao dịch đã thanh toán</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <span class="stat-value success">{{ stats.paidTransactions }}</span>
          <div class="stat-note">{{ stats.paidRevenueVnd | number }}đ</div>
        </mat-card-content>
      </mat-card>
    </div>

    <mat-card *ngIf="!loading && stats" class="chart-card">
      <mat-card-header>
        <mat-card-title>Doanh thu giao dịch theo VND</mat-card-title>
        <mat-card-subtitle>Chỉ tính đơn đã thanh toán trong khoảng thời gian lọc</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <div class="payment-filters">
          <mat-form-field appearance="outline">
            <mat-label>Từ ngày</mat-label>
            <input matInput type="date" [(ngModel)]="paymentFrom" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Đến ngày</mat-label>
            <input matInput type="date" [(ngModel)]="paymentTo" />
          </mat-form-field>
          <button mat-raised-button color="primary" (click)="applyPaymentFilter()">Lọc</button>
          <button mat-stroked-button type="button" (click)="setPaymentRange(7)">7 ngày</button>
          <button mat-stroked-button type="button" (click)="setPaymentRange(30)">30 ngày</button>
        </div>
        <div class="chart" *ngIf="stats.paymentChart.length; else emptyChart">
          <div class="chart-legend">
            <span class="legend-swatch"></span>
            <span>Doanh thu VND</span>
          </div>
          <div class="chart-shell">
            <div class="y-axis">
              <span *ngFor="let label of chartYAxisLabels()">{{ formatVndShort(label) }}</span>
            </div>
            <div class="plot-area">
              <div class="grid-lines">
                <span *ngFor="let _ of chartYAxisLabels()"></span>
              </div>
              <div class="plot-bars" [style.grid-template-columns]="chartColumns">
                <div class="plot-column" *ngFor="let point of stats.paymentChart">
                  <div
                    class="thin-bar"
                    [style.height.%]="barHeight(point.amountVnd)"
                    [title]="formatChartDate(point.date) + ': ' + (point.amountVnd | number) + 'đ'"
                  ></div>
                </div>
              </div>
            </div>
            <div class="x-axis" [style.grid-template-columns]="chartColumns">
              <span *ngFor="let point of stats.paymentChart">{{ formatChartDate(point.date) }}</span>
            </div>
            <div class="x-counts" [style.grid-template-columns]="chartColumns">
              <span *ngFor="let point of stats.paymentChart">{{ point.transactionCount }} GD</span>
            </div>
          </div>
        </div>
        <ng-template #emptyChart>
          <div class="empty">Chưa có dữ liệu giao dịch đã thanh toán.</div>
        </ng-template>
      </mat-card-content>
    </mat-card>
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
      .stat-value.success { color: #059669; }
      .stat-note { margin-top: 6px; color: #64748b; font-weight: 600; }
      mat-card-content { padding-top: 8px; }
      .chart-card {
        margin-top: 20px;
        border-radius: 22px;
        background: rgba(247, 248, 252, 0.96);
        box-shadow: 0 14px 32px rgba(15, 23, 42, 0.14);
      }
      .payment-filters {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        margin-bottom: 14px;
      }
      .payment-filters mat-form-field {
        width: 180px;
      }
      .chart { overflow-x: auto; padding: 8px 4px 4px; }
      .chart-legend {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        color: #334155;
        font-size: 13px;
        font-weight: 600;
      }
      .legend-swatch {
        width: 28px;
        height: 8px;
        border-radius: 999px;
        background: rgba(96, 165, 250, 0.75);
      }
      .chart-shell {
        min-width: 760px;
        display: grid;
        grid-template-columns: 58px 1fr;
        grid-template-rows: 260px auto auto;
        border: 1px solid rgba(226, 232, 240, 0.9);
        border-radius: 16px;
        background: #ffffff;
        padding: 18px 18px 14px 10px;
      }
      .y-axis {
        grid-column: 1;
        grid-row: 1;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: flex-end;
        padding-right: 10px;
        color: #64748b;
        font-size: 11px;
      }
      .plot-area {
        grid-column: 2;
        grid-row: 1;
        position: relative;
        border-left: 1px solid rgba(203, 213, 225, 0.9);
        border-bottom: 1px solid rgba(203, 213, 225, 0.9);
      }
      .grid-lines {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      .grid-lines span {
        width: 100%;
        border-top: 1px solid rgba(226, 232, 240, 0.95);
      }
      .plot-bars {
        position: absolute;
        inset: 0;
        display: grid;
        align-items: end;
        z-index: 1;
      }
      .plot-column {
        height: 100%;
        display: flex;
        align-items: flex-end;
        justify-content: center;
      }
      .thin-bar {
        width: 8px;
        min-height: 2px;
        border-radius: 4px 4px 0 0;
        background: rgba(96, 165, 250, 0.72);
        box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.18);
      }
      .x-axis,
      .x-counts {
        grid-column: 2;
        display: grid;
        text-align: center;
        color: #64748b;
        font-size: 11px;
      }
      .x-axis {
        grid-row: 2;
        padding-top: 8px;
      }
      .x-counts {
        grid-row: 3;
        padding-top: 4px;
        font-weight: 600;
      }
      .x-axis span,
      .x-counts span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .thin-bar:hover {
        background: rgba(37, 99, 235, 0.82);
      }
      .empty {
        padding: 32px;
        text-align: center;
        color: #64748b;
      }
      @media (max-width: 768px) {
        .payment-filters mat-form-field,
        .payment-filters button { width: 100%; }
        .chart-shell { min-width: 640px; grid-template-rows: 220px auto auto; }
        .thin-bar { width: 6px; }
      }
    `
  ]
})
export class AdminDashboardComponent implements OnInit {
  stats: DashboardStats | null = null;
  loading = true;
  paymentFrom = '';
  paymentTo = '';

  constructor(private admin: AdminService) {}

  ngOnInit() {
    this.setPaymentRange(7, false);
    this.loadStats();
  }

  loadStats() {
    this.loading = true;
    this.admin.getDashboardStats({ from: this.paymentFrom, to: this.paymentTo }).subscribe({
      next: (s) => {
        this.stats = s;
        this.paymentFrom = s.paymentRange?.from || this.paymentFrom;
        this.paymentTo = s.paymentRange?.to || this.paymentTo;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  applyPaymentFilter() {
    this.loadStats();
  }

  setPaymentRange(days: number, reload = true) {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - (days - 1));
    this.paymentFrom = this.toDateInputValue(from);
    this.paymentTo = this.toDateInputValue(to);
    if (reload) this.loadStats();
  }

  get chartColumns(): string {
    const count = Math.max(this.stats?.paymentChart.length || 1, 1);
    return `repeat(${count}, minmax(42px, 1fr))`;
  }

  barHeight(amount: number): number {
    const max = Math.max(...(this.stats?.paymentChart || []).map((point) => point.amountVnd), 0);
    if (!max || !amount) return 0;
    return Math.max(2, Math.round((amount / max) * 100));
  }

  formatChartDate(date: string): string {
    return new Date(date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  }

  chartYAxisLabels(): number[] {
    const max = Math.max(...(this.stats?.paymentChart || []).map((point) => point.amountVnd), 0);
    const roundedMax = max ? Math.ceil(max / 10000) * 10000 : 10000;
    return [
      roundedMax,
      Math.round(roundedMax * 0.75),
      Math.round(roundedMax * 0.5),
      Math.round(roundedMax * 0.25),
      0
    ];
  }

  formatVndShort(value: number): string {
    if (value >= 1000000) return `${value / 1000000}tr`;
    if (value >= 1000) return `${value / 1000}k`;
    return `${value}`;
  }

  private toDateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
