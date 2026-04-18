import { Component, OnInit } from '@angular/core';
import { AdminService, ReportItem } from '../../services/admin.service';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

const REASON_LABELS: Record<string, string> = {
  inappropriate: 'Không phù hợp',
  harassment: 'Quấy rối',
  spam: 'Spam',
  other: 'Khác'
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ xử lý',
  dismissed: 'Đã bỏ qua',
  warned: 'Đã cảnh cáo',
  banned: 'Đã khóa',
  processed: 'Đã xử lý'
};

@Component({
  selector: 'app-admin-reports',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatSnackBarModule,
    MatTooltipModule
  ],
  template: `
    <h1>Báo cáo</h1>
    <p class="sub">Quản lý báo cáo và xử lý vi phạm</p>
    <mat-form-field appearance="outline" class="filter">
      <mat-label>Trạng thái</mat-label>
      <mat-select [(value)]="statusFilter" (selectionChange)="load()">
        <mat-option value="">Tất cả</mat-option>
        <mat-option value="pending">Chờ xử lý</mat-option>
        <mat-option value="dismissed">Đã bỏ qua</mat-option>
        <mat-option value="warned">Đã cảnh cáo</mat-option>
        <mat-option value="banned">Đã khóa</mat-option>
        <mat-option value="processed">Đã xử lý</mat-option>
      </mat-select>
    </mat-form-field>

    <table mat-table [dataSource]="dataSource" class="reports-table mat-elevation-z0">
      <ng-container matColumnDef="reporter">
        <th mat-header-cell *matHeaderCellDef>Người báo cáo</th>
        <td mat-cell *matCellDef="let r">{{ r.reporter?.displayName || '-' }}</td>
      </ng-container>
      <ng-container matColumnDef="reported">
        <th mat-header-cell *matHeaderCellDef>Bị báo cáo</th>
        <td mat-cell *matCellDef="let r">{{ r.reported?.displayName || '-' }}</td>
      </ng-container>
      <ng-container matColumnDef="reason">
        <th mat-header-cell *matHeaderCellDef>Lý do</th>
        <td mat-cell *matCellDef="let r">{{ reasonLabel(r.reason) }}</td>
      </ng-container>
      <ng-container matColumnDef="status">
        <th mat-header-cell *matHeaderCellDef>Trạng thái</th>
        <td mat-cell *matCellDef="let r">{{ statusLabel(r.status) }}</td>
      </ng-container>
      <ng-container matColumnDef="createdAt">
        <th mat-header-cell *matHeaderCellDef>Thời gian</th>
        <td mat-cell *matCellDef="let r">{{ r.createdAt | date:'dd/MM/yyyy HH:mm' }}</td>
      </ng-container>
      <ng-container matColumnDef="actions">
        <th mat-header-cell *matHeaderCellDef>Hành động</th>
        <td mat-cell *matCellDef="let r">
          <ng-container *ngIf="r.status === 'pending'">
            <button mat-icon-button (click)="action(r.id, 'dismiss')" matTooltip="Bỏ qua">
              <i class="fi fi-rr-cross-small"></i>
            </button>
            <button mat-icon-button (click)="action(r.id, 'warn')" matTooltip="Cảnh cáo">
              <i class="fi fi-rr-triangle-warning"></i>
            </button>
            <button mat-icon-button (click)="action(r.id, 'ban_temp')" matTooltip="Khóa tạm">
              <i class="fi fi-rr-lock"></i>
            </button>
            <button mat-icon-button (click)="action(r.id, 'ban_permanent')" matTooltip="Khóa vĩnh viễn">
              <i class="fi fi-rr-ban"></i>
            </button>
          </ng-container>
          <button *ngIf="r.status === 'pending'" mat-icon-button (click)="action(r.id, 'processed')" matTooltip="Đánh dấu đã xử lý">
            <i class="fi fi-rr-check-circle"></i>
          </button>
        </td>
      </ng-container>

      <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
      <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
    </table>

    <mat-paginator
      [length]="total"
      [pageSize]="pageSize"
      [pageIndex]="page - 1"
      [pageSizeOptions]="[10, 20, 50]"
      (page)="onPage($event)"
      showFirstLastButtons>
    </mat-paginator>
  `,
  styles: [
    `
      h1 { margin: 0 0 4px; color: #f9fafb; }
      .sub { margin: 0 0 16px; color: #cbd5e1; }
      .filter { margin-bottom: 16px; width: 200px; }
      .reports-table {
        width: 100%;
        background: rgba(247, 248, 252, 0.96);
        border-radius: 18px;
        overflow: hidden;
      }
      th, td { padding: 10px 16px; }
      th { color: #334155; font-weight: 700; }
      mat-paginator { margin-top: 16px; }
      .fi { font-size: 20px; line-height: 1; }
    `
  ]
})
export class AdminReportsComponent implements OnInit {
  dataSource = new MatTableDataSource<ReportItem>([]);
  displayedColumns = ['reporter', 'reported', 'reason', 'status', 'createdAt', 'actions'];
  statusFilter = '';
  page = 1;
  pageSize = 20;
  total = 0;

  constructor(
    private admin: AdminService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.admin.getReports(this.statusFilter || undefined, this.page, this.pageSize).subscribe({
      next: (res) => {
        this.dataSource.data = res.reports;
        this.total = res.total;
      }
    });
  }

  onPage(e: PageEvent) {
    this.page = e.pageIndex + 1;
    this.pageSize = e.pageSize;
    this.load();
  }

  reasonLabel(r: string) {
    return REASON_LABELS[r] || r;
  }

  statusLabel(s: string) {
    return STATUS_LABELS[s] || s;
  }

  action(id: string, action: string) {
    this.admin.updateReport(id, action).subscribe({
      next: () => {
        this.snackBar.open('Đã xử lý', 'Đóng', { duration: 2000 });
        this.load();
      },
      error: (err) => {
        this.snackBar.open(err.error?.error || 'Lỗi', 'Đóng', { duration: 3000 });
      }
    });
  }
}
