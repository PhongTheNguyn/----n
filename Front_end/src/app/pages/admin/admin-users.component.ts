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
import { AdminService, AdminUserItem } from '../../services/admin.service';

@Component({
  selector: 'app-admin-users',
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
    <h1>Người dùng</h1>
    <p class="sub">Tìm kiếm, phân quyền và khóa/mở khóa tài khoản</p>

    <div class="filters">
      <mat-form-field appearance="outline">
        <mat-label>Tìm theo tên, email hoặc ID</mat-label>
        <input matInput [(ngModel)]="keyword" (keyup.enter)="reloadFirstPage()" />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Role</mat-label>
        <mat-select [(ngModel)]="roleFilter" (selectionChange)="reloadFirstPage()">
          <mat-option value="">Tất cả</mat-option>
          <mat-option value="user">User</mat-option>
          <mat-option value="admin">Admin</mat-option>
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Trạng thái</mat-label>
        <mat-select [(ngModel)]="statusFilter" (selectionChange)="reloadFirstPage()">
          <mat-option value="">Tất cả</mat-option>
          <mat-option value="active">Đang hoạt động</mat-option>
          <mat-option value="banned">Đã khóa</mat-option>
        </mat-select>
      </mat-form-field>
      <button mat-raised-button color="primary" (click)="reloadFirstPage()">Lọc</button>
    </div>

    <table mat-table [dataSource]="dataSource" class="users-table mat-elevation-z0">
      <ng-container matColumnDef="user">
        <th mat-header-cell *matHeaderCellDef>Người dùng</th>
        <td mat-cell *matCellDef="let u">
          <div class="name">{{ u.displayName }}</div>
          <small>{{ u.email }}</small>
          <small class="id">{{ u.id }}</small>
        </td>
      </ng-container>
      <ng-container matColumnDef="profile">
        <th mat-header-cell *matHeaderCellDef>Thông tin</th>
        <td mat-cell *matCellDef="let u">
          <div>{{ u.gender || '-' }} · {{ u.age || '-' }} tuổi</div>
          <small>{{ u.country || '-' }}</small>
        </td>
      </ng-container>
      <ng-container matColumnDef="role">
        <th mat-header-cell *matHeaderCellDef>Role</th>
        <td mat-cell *matCellDef="let u">
          <mat-form-field appearance="outline" class="role-field">
            <mat-select [ngModel]="u.role" (selectionChange)="changeRole(u, $event.value)">
              <mat-option value="user">User</mat-option>
              <mat-option value="admin">Admin</mat-option>
            </mat-select>
          </mat-form-field>
        </td>
      </ng-container>
      <ng-container matColumnDef="coins">
        <th mat-header-cell *matHeaderCellDef>Coin</th>
        <td mat-cell *matCellDef="let u">{{ u.coinBalance | number }}</td>
      </ng-container>
      <ng-container matColumnDef="status">
        <th mat-header-cell *matHeaderCellDef>Trạng thái</th>
        <td mat-cell *matCellDef="let u">
          <span class="status-badge" [class.banned]="u.isBanned">
            {{ u.isBanned ? 'Đã khóa' : 'Hoạt động' }}
          </span>
          <small *ngIf="u.bannedUntil">Đến {{ u.bannedUntil | date:'dd/MM/yyyy HH:mm' }}</small>
        </td>
      </ng-container>
      <ng-container matColumnDef="createdAt">
        <th mat-header-cell *matHeaderCellDef>Ngày tạo</th>
        <td mat-cell *matCellDef="let u">{{ u.createdAt | date:'dd/MM/yyyy' }}</td>
      </ng-container>
      <ng-container matColumnDef="actions">
        <th mat-header-cell *matHeaderCellDef>Hành động</th>
        <td mat-cell *matCellDef="let u">
          <button *ngIf="!u.isBanned" mat-button color="warn" (click)="toggleBan(u, true)">Khóa</button>
          <button *ngIf="u.isBanned" mat-button color="primary" (click)="toggleBan(u, false)">Mở khóa</button>
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
        grid-template-columns: minmax(240px, 1fr) 160px 180px auto;
        gap: 10px;
        align-items: center;
        margin-bottom: 14px;
      }
      .users-table {
        width: 100%;
        background: rgba(247, 248, 252, 0.96);
        border-radius: 18px;
        overflow: hidden;
        box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
      }
      th, td { padding: 10px 14px; vertical-align: middle; }
      th { color: #334155; font-weight: 700; }
      small {
        display: block;
        color: #64748b;
        margin-top: 2px;
      }
      .name { font-weight: 700; color: #0f172a; }
      .id { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .role-field { width: 120px; margin-top: 12px; }
      .status-badge {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 4px 10px;
        color: #065f46;
        background: rgba(16, 185, 129, 0.14);
        border: 1px solid rgba(16, 185, 129, 0.32);
        font-size: 12px;
        font-weight: 700;
      }
      .status-badge.banned {
        color: #991b1b;
        background: rgba(239, 68, 68, 0.12);
        border-color: rgba(239, 68, 68, 0.3);
      }
      mat-paginator { margin-top: 16px; }
      @media (max-width: 1080px) {
        .filters { grid-template-columns: 1fr; }
      }
    `
  ]
})
export class AdminUsersComponent implements OnInit {
  dataSource = new MatTableDataSource<AdminUserItem>([]);
  displayedColumns = ['user', 'profile', 'role', 'coins', 'status', 'createdAt', 'actions'];

  keyword = '';
  roleFilter = '';
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
    this.admin.getUsers(
      {
        q: this.keyword.trim() || undefined,
        role: this.roleFilter || undefined,
        status: this.statusFilter || undefined
      },
      this.page,
      this.pageSize
    ).subscribe({
      next: (res) => {
        this.dataSource.data = res.users;
        this.total = res.total;
      },
      error: (err) => {
        this.snackBar.open(err.error?.error || 'Không tải được danh sách người dùng', 'Đóng', {
          duration: 3000
        });
      }
    });
  }

  reloadFirstPage() {
    this.page = 1;
    this.load();
  }

  onPage(e: PageEvent) {
    this.page = e.pageIndex + 1;
    this.pageSize = e.pageSize;
    this.load();
  }

  toggleBan(user: AdminUserItem, banned: boolean) {
    const actionText = banned ? 'khóa' : 'mở khóa';
    const ok = window.confirm(`Bạn có chắc muốn ${actionText} tài khoản ${user.displayName || user.email}?`);
    if (!ok) return;

    this.admin.updateUser(user.id, { isBanned: banned, bannedUntil: null }).subscribe({
      next: (res) => {
        this.snackBar.open(res.message || 'Đã cập nhật người dùng', 'Đóng', { duration: 2400 });
        this.load();
      },
      error: (err) => {
        this.snackBar.open(err.error?.error || 'Cập nhật thất bại', 'Đóng', { duration: 3000 });
      }
    });
  }

  changeRole(user: AdminUserItem, role: string) {
    if (role === user.role) return;
    const ok = window.confirm(`Đổi role của ${user.displayName || user.email} thành ${role}?`);
    if (!ok) {
      this.load();
      return;
    }

    this.admin.updateUser(user.id, { role }).subscribe({
      next: (res) => {
        this.snackBar.open(res.message || 'Đã cập nhật role', 'Đóng', { duration: 2400 });
        this.load();
      },
      error: (err) => {
        this.snackBar.open(err.error?.error || 'Cập nhật role thất bại', 'Đóng', { duration: 3000 });
        this.load();
      }
    });
  }
}
