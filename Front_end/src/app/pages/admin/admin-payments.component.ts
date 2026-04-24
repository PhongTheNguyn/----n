import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AdminService, PaymentItem } from '../../services/admin.service';

@Component({
  selector: 'app-admin-payments',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule
  ],
  template: `
    <h1>Thanh toán</h1>
    <p class="sub">Quản lý đơn ZaloPay và nạp coin thủ công</p>

    <div class="filters">
      <mat-form-field appearance="outline">
        <mat-label>Trạng thái</mat-label>
        <mat-select [(ngModel)]="statusFilter" (selectionChange)="load()">
          <mat-option value="">Tất cả</mat-option>
          <mat-option value="pending">Pending</mat-option>
          <mat-option value="created">Created</mat-option>
          <mat-option value="paid">Paid</mat-option>
          <mat-option value="failed">Failed</mat-option>
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>User ID</mat-label>
        <input matInput [(ngModel)]="userIdFilter" (keyup.enter)="load()" />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Order ID</mat-label>
        <input matInput [(ngModel)]="orderIdFilter" (keyup.enter)="load()" />
      </mat-form-field>
      <button mat-raised-button color="primary" (click)="load()">Lọc</button>
      <button mat-stroked-button type="button" (click)="exportCsv()">Export CSV</button>
    </div>

    <div class="topup-box">
      <mat-form-field appearance="outline">
        <mat-label>Nạp coin cho userId</mat-label>
        <input matInput [(ngModel)]="topupUserId" />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Số coin</mat-label>
        <input matInput type="number" [(ngModel)]="topupCoins" />
      </mat-form-field>
      <button mat-raised-button color="accent" (click)="topup()">Nạp coin</button>
    </div>

    <table mat-table [dataSource]="dataSource" class="payments-table mat-elevation-z0">
      <ng-container matColumnDef="orderId">
        <th mat-header-cell *matHeaderCellDef>Order</th>
        <td mat-cell *matCellDef="let p">{{ p.appTransId }}</td>
      </ng-container>
      <ng-container matColumnDef="user">
        <th mat-header-cell *matHeaderCellDef>User</th>
        <td mat-cell *matCellDef="let p">
          <div>{{ p.user?.displayName || p.user?.email || p.userId }}</div>
          <small>{{ p.userId }}</small>
        </td>
      </ng-container>
      <ng-container matColumnDef="amount">
        <th mat-header-cell *matHeaderCellDef>Số tiền</th>
        <td mat-cell *matCellDef="let p">{{ p.amountVnd | number }}đ ({{ p.coinAmount }} coin)</td>
      </ng-container>
      <ng-container matColumnDef="status">
        <th mat-header-cell *matHeaderCellDef>Trạng thái</th>
        <td mat-cell *matCellDef="let p">
          <span class="status-badge" [class]="statusClass(p.status)">{{ p.status }}</span>
        </td>
      </ng-container>
      <ng-container matColumnDef="time">
        <th mat-header-cell *matHeaderCellDef>Tạo lúc</th>
        <td mat-cell *matCellDef="let p">{{ p.createdAt | date:'dd/MM/yyyy HH:mm' }}</td>
      </ng-container>
      <ng-container matColumnDef="actions">
        <th mat-header-cell *matHeaderCellDef>Hành động</th>
        <td mat-cell *matCellDef="let p">
          <button mat-button color="primary" (click)="sync(p)">Sync</button>
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
      h1 { margin: 0 0 4px; color: #111827; }
      .sub { margin: 0 0 16px; color: #4b5563; }
      .filters {
        display: grid;
        grid-template-columns: repeat(4, minmax(160px, 1fr)) auto;
        gap: 10px;
        align-items: center;
        margin-bottom: 12px;
      }
      .topup-box {
        display: grid;
        grid-template-columns: 1fr 140px auto;
        gap: 10px;
        align-items: center;
        margin-bottom: 14px;
      }
      .payments-table {
        width: 100%;
        background: rgba(247, 248, 252, 0.96);
        border-radius: 18px;
        overflow: hidden;
        box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
      }
      .status-badge {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 700;
        border: 1px solid transparent;
      }
      .status-paid {
        color: #065f46;
        background: rgba(16, 185, 129, 0.15);
        border-color: rgba(16, 185, 129, 0.35);
      }
      .status-created {
        color: #1e3a8a;
        background: rgba(59, 130, 246, 0.12);
        border-color: rgba(59, 130, 246, 0.35);
      }
      .status-pending {
        color: #854d0e;
        background: rgba(245, 158, 11, 0.16);
        border-color: rgba(245, 158, 11, 0.35);
      }
      .status-failed {
        color: #991b1b;
        background: rgba(239, 68, 68, 0.12);
        border-color: rgba(239, 68, 68, 0.35);
      }
      th, td { padding: 10px 14px; }
      small { color: #64748b; }
      mat-paginator { margin-top: 16px; }
      @media (max-width: 960px) {
        .filters, .topup-box { grid-template-columns: 1fr; }
      }
    `
  ]
})
export class AdminPaymentsComponent implements OnInit {
  dataSource = new MatTableDataSource<PaymentItem>([]);
  displayedColumns = ['orderId', 'user', 'amount', 'status', 'time', 'actions'];

  statusFilter = '';
  userIdFilter = '';
  orderIdFilter = '';
  topupUserId = '';
  topupCoins = 10;

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
    this.admin
      .getPayments(
        {
          status: this.statusFilter || undefined,
          userId: this.userIdFilter || undefined,
          orderId: this.orderIdFilter || undefined
        },
        this.page,
        this.pageSize
      )
      .subscribe({
        next: (res) => {
          this.dataSource.data = res.payments;
          this.total = res.total;
        },
        error: (err) => {
          this.snackBar.open(err.error?.error || 'Không tải được dữ liệu thanh toán', 'Đóng', {
            duration: 3000
          });
        }
      });
  }

  onPage(e: PageEvent) {
    this.page = e.pageIndex + 1;
    this.pageSize = e.pageSize;
    this.load();
  }

  sync(row: PaymentItem) {
    const ok = window.confirm(`Đồng bộ lại đơn ${row.appTransId}?`);
    if (!ok) return;
    this.admin.syncPayment(row.appTransId).subscribe({
      next: () => {
        this.snackBar.open('Đã đồng bộ đơn thành công', 'Đóng', { duration: 2200 });
        this.load();
      },
      error: (err) => {
        this.snackBar.open(err.error?.error || 'Đồng bộ đơn thất bại', 'Đóng', { duration: 3000 });
      }
    });
  }

  topup() {
    if (!this.topupUserId || this.topupCoins <= 0) {
      this.snackBar.open('Nhập userId và số coin hợp lệ', 'Đóng', { duration: 2500 });
      return;
    }
    const ok = window.confirm(`Nạp ${this.topupCoins} coin cho user ${this.topupUserId}?`);
    if (!ok) return;
    this.admin.topupCoins(this.topupUserId, this.topupCoins).subscribe({
      next: (res) => {
        this.snackBar.open(`${res.message}. Số dư mới: ${res.coinBalance} coin`, 'Đóng', {
          duration: 3000
        });
      },
      error: (err) => {
        this.snackBar.open(err.error?.error || 'Nạp coin thất bại', 'Đóng', { duration: 3000 });
      }
    });
  }

  statusClass(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'paid':
        return 'status-badge status-paid';
      case 'created':
        return 'status-badge status-created';
      case 'pending':
        return 'status-badge status-pending';
      case 'failed':
        return 'status-badge status-failed';
      default:
        return 'status-badge';
    }
  }

  exportCsv() {
    const rows = this.dataSource.data || [];
    if (!rows.length) {
      this.snackBar.open('Không có dữ liệu để export', 'Đóng', { duration: 2200 });
      return;
    }
    const header = [
      'order_id',
      'user_id',
      'user_name',
      'user_email',
      'amount_vnd',
      'coin_amount',
      'status',
      'return_code',
      'created_at',
      'paid_at'
    ];
    const csvRows = rows.map((p) => [
      p.appTransId,
      p.userId,
      p.user?.displayName || '',
      p.user?.email || '',
      p.amountVnd,
      p.coinAmount,
      p.status,
      p.returnCode ?? '',
      p.createdAt,
      p.paidAt || ''
    ]);

    const csv = [header, ...csvRows]
      .map((line) =>
        line
          .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `admin-payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
