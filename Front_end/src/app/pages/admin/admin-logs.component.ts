import { Component, OnInit } from '@angular/core';
import { AdminService, LogItem } from '../../services/admin.service';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

const ACTION_LABELS: Record<string, string> = {
  login: 'Đăng nhập',
  report: 'Báo cáo',
  report_action: 'Xử lý báo cáo',
  ban: 'Khóa tài khoản'
};

@Component({
  selector: 'app-admin-logs',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatSelectModule,
    MatFormFieldModule
  ],
  template: `
    <h1>Nhật ký hệ thống</h1>
    <p class="sub">Theo dõi hoạt động quản trị và bảo mật</p>
    <mat-form-field appearance="outline" class="filter">
      <mat-label>Hành động</mat-label>
      <mat-select [(value)]="actionFilter" (selectionChange)="load()">
        <mat-option value="">Tất cả</mat-option>
        <mat-option value="login">Đăng nhập</mat-option>
        <mat-option value="report">Báo cáo</mat-option>
        <mat-option value="report_action">Xử lý báo cáo</mat-option>
      </mat-select>
    </mat-form-field>

    <table mat-table [dataSource]="dataSource" class="logs-table mat-elevation-z0">
      <ng-container matColumnDef="action">
        <th mat-header-cell *matHeaderCellDef>Hành động</th>
        <td mat-cell *matCellDef="let l">{{ actionLabel(l.action) }}</td>
      </ng-container>
      <ng-container matColumnDef="userId">
        <th mat-header-cell *matHeaderCellDef>User ID</th>
        <td mat-cell *matCellDef="let l">{{ l.user_id || '-' }}</td>
      </ng-container>
      <ng-container matColumnDef="targetId">
        <th mat-header-cell *matHeaderCellDef>Target ID</th>
        <td mat-cell *matCellDef="let l">{{ l.target_id || '-' }}</td>
      </ng-container>
      <ng-container matColumnDef="details">
        <th mat-header-cell *matHeaderCellDef>Chi tiết</th>
        <td mat-cell *matCellDef="let l">{{ l.details || '-' }}</td>
      </ng-container>
      <ng-container matColumnDef="createdAt">
        <th mat-header-cell *matHeaderCellDef>Thời gian</th>
        <td mat-cell *matCellDef="let l">{{ l.created_at | date:'dd/MM/yyyy HH:mm:ss' }}</td>
      </ng-container>

      <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
      <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
    </table>

    <mat-paginator
      [length]="total"
      [pageSize]="pageSize"
      [pageIndex]="page - 1"
      [pageSizeOptions]="[20, 50, 100]"
      (page)="onPage($event)"
      showFirstLastButtons>
    </mat-paginator>
  `,
  styles: [
    `
      h1 { margin: 0 0 4px; color: #111827; }
      .sub { margin: 0 0 16px; color: #4b5563; }
      .filter { margin-bottom: 16px; width: 200px; }
      .logs-table {
        width: 100%;
        background: rgba(247, 248, 252, 0.96);
        border-radius: 18px;
        overflow: hidden;
        box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
      }
      th, td { padding: 10px 16px; }
      th { color: #334155; font-weight: 700; }
      mat-paginator { margin-top: 16px; }
    `
  ]
})
export class AdminLogsComponent implements OnInit {
  dataSource = new MatTableDataSource<LogItem>([]);
  displayedColumns = ['action', 'userId', 'targetId', 'details', 'createdAt'];
  actionFilter = '';
  page = 1;
  pageSize = 50;
  total = 0;

  constructor(private admin: AdminService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.admin.getLogs(this.actionFilter || undefined, this.page, this.pageSize).subscribe({
      next: (res) => {
        this.dataSource.data = res.logs;
        this.total = res.total;
      }
    });
  }

  onPage(e: PageEvent) {
    this.page = e.pageIndex + 1;
    this.pageSize = e.pageSize;
    this.load();
  }

  actionLabel(a: string) {
    return ACTION_LABELS[a] || a;
  }
}
