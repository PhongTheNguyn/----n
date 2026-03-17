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
    <table mat-table [dataSource]="dataSource" class="sessions-table">
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
      h1 { margin-bottom: 16px; }
      .sessions-table { width: 100%; }
      th, td { padding: 8px 16px; }
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
