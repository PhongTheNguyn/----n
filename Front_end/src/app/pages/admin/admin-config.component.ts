import { Component, OnInit } from '@angular/core';
import { AdminService, AdminConfig } from '../../services/admin.service';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-admin-config',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule
  ],
  template: `
    <h1>Cấu hình tự động xử lý vi phạm</h1>
    <mat-card>
      <mat-card-content>
        <p class="hint">Cấu hình ngưỡng số lần report để tự động xử lý (Admin vẫn có thể xử lý thủ công từ trang Báo cáo)</p>
        <mat-form-field appearance="outline">
          <mat-label>≥ Số lần report → Cảnh cáo</mat-label>
          <input matInput type="number" [(ngModel)]="config.warnThreshold" min="1">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>≥ Số lần report → Khóa tạm</mat-label>
          <input matInput type="number" [(ngModel)]="config.tempBanThreshold" min="1">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>≥ Số lần report → Khóa vĩnh viễn</mat-label>
          <input matInput type="number" [(ngModel)]="config.permanentBanThreshold" min="1">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Số ngày khóa tạm</mat-label>
          <input matInput type="number" [(ngModel)]="config.tempBanDays" min="1">
        </mat-form-field>
        <div>
          <button mat-raised-button color="primary" (click)="save()">Lưu cấu hình</button>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [
    `
      h1 { margin-bottom: 16px; }
      .hint { margin-bottom: 16px; color: #666; }
      mat-form-field { display: block; margin-bottom: 8px; max-width: 320px; }
      button { margin-top: 16px; }
    `
  ]
})
export class AdminConfigComponent implements OnInit {
  config: AdminConfig = {
    warnThreshold: 3,
    tempBanThreshold: 5,
    permanentBanThreshold: 7,
    tempBanDays: 7
  };

  constructor(
    private admin: AdminService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.admin.getConfig().subscribe({
      next: (c) => {
        this.config = { ...this.config, ...c };
      }
    });
  }

  save() {
    this.admin.updateConfig(this.config).subscribe({
      next: () => {
        this.snackBar.open('Đã lưu cấu hình', 'Đóng', { duration: 2000 });
      },
      error: (err) => {
        this.snackBar.open(err.error?.error || 'Lỗi', 'Đóng', { duration: 3000 });
      }
    });
  }
}
