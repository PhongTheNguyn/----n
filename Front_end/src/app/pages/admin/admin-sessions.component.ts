import { Component, OnInit } from '@angular/core';
import { AdminService, SessionItem } from '../../services/admin.service';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-admin-sessions',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatPaginatorModule],
  template: `
    <h1>Phiên gọi</h1>
    <p class="sub">Theo dõi các phiên kết nối trong hệ thống</p>
    <table mat-table [dataSource]="dataSource" class="sessions-table mat-elevation-z0">
      <ng-container matColumnDef="userA">
        <th mat-header-cell *matHeaderCellDef>User A</th>
        <td mat-cell *matCellDef="let s">{{ s.user_a_id }}</td>
      </ng-container>
      <ng-container matColumnDef="userB">
        <th mat-header-cell *matHeaderCellDef>User B</th>
        <td mat-cell *matCellDef="let s">{{ s.user_b_id }}</td>
      </ng-container>
      <ng-container matColumnDef="roomId">
        <th mat-header-cell *matHeaderCellDef>Room</th>
        <td mat-cell *matCellDef="let s">{{ s.room_id }}</td>
      </ng-container>
      <ng-container matColumnDef="startedAt">
        <th mat-header-cell *matHeaderCellDef>Bắt đầu</th>
        <td mat-cell *matCellDef="let s">{{ s.started_at | date:'dd/MM/yyyy HH:mm:ss' }}</td>
      </ng-container>
      <ng-container matColumnDef="endedAt">
        <th mat-header-cell *matHeaderCellDef>Kết thúc</th>
        <td mat-cell *matCellDef="let s">{{ s.ended_at ? (s.ended_at | date:'dd/MM/yyyy HH:mm:ss') : '-' }}</td>
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
      .sessions-table {
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
export class AdminSessionsComponent implements OnInit {
  dataSource = new MatTableDataSource<SessionItem>([]);
  displayedColumns = ['userA', 'userB', 'roomId', 'startedAt', 'endedAt'];
  page = 1;
  pageSize = 30;
  total = 0;

  constructor(private admin: AdminService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.admin.getSessions(this.page, this.pageSize).subscribe({
      next: (res) => {
        this.dataSource.data = res.sessions;
        this.total = res.total;
      }
    });
  }

  onPage(e: PageEvent) {
    this.page = e.pageIndex + 1;
    this.pageSize = e.pageSize;
    this.load();
  }
}
