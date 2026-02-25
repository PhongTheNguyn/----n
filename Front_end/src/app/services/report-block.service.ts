import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { getApiUrl } from '../core/api-config';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ReportBlockService {
  private get apiUrl(): string {
    return getApiUrl();
  }

  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) {}

  private getHeaders() {
    const token = this.auth.getToken();
    return {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      }
    };
  }

  report(reportedId: string, reason: string, description?: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.apiUrl}/api/reports`,
      { reportedId, reason, description },
      this.getHeaders()
    );
  }

  block(blockedId: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.apiUrl}/api/block`,
      { blockedId },
      this.getHeaders()
    );
  }

  unblock(blockedId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(
      `${this.apiUrl}/api/block/${blockedId}`,
      this.getHeaders()
    );
  }

  getBlockedList(): Observable<
    Array<{ id: string; blockedId: string; displayName?: string; avatarUrl?: string }>
  > {
    return this.http.get<Array<{ id: string; blockedId: string; displayName?: string; avatarUrl?: string }>>(
      `${this.apiUrl}/api/block`,
      this.getHeaders()
    );
  }
}
