import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { getApiUrl } from '../core/api-config';
import { AuthService } from './auth.service';

export interface DashboardStats {
  totalUsers: number;
  reportsToday: number;
  totalReports: number;
  totalSessions: number;
  pendingReports: number;
  onlineCount: number;
}

export interface ReportItem {
  id: string;
  reporterId: string;
  reporter: { id: string; displayName: string; email: string; avatarUrl?: string };
  reportedId: string;
  reported: { id: string; displayName: string; email: string; avatarUrl?: string };
  reason: string;
  description?: string;
  status: string;
  actionBy?: string;
  actionAt?: string;
  createdAt: string;
}

export interface SessionItem {
  id: string;
  user_a_id: string;
  user_b_id: string;
  room_id: string;
  started_at: string;
  ended_at?: string;
}

export interface LogItem {
  id: string;
  action: string;
  user_id?: string;
  target_id?: string;
  details?: string;
  created_at: string;
}

export interface AdminConfig {
  warnThreshold: number;
  tempBanThreshold: number;
  permanentBanThreshold: number;
  tempBanDays: number;
}

export interface PaymentItem {
  id: string;
  userId: string;
  user?: { id: string; displayName?: string; email?: string } | null;
  appTransId: string;
  zpTransId?: string;
  amountVnd: number;
  coinAmount: number;
  status: string;
  returnCode?: number;
  createdAt: string;
  paidAt?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private get apiUrl(): string {
    return getApiUrl();
  }

  private get token(): string | null {
    return this.auth.getToken();
  }

  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) {}

  private headers(): { [k: string]: string } {
    const t = this.token;
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  getDashboardStats(): Observable<DashboardStats> {
    return this.http.get<DashboardStats>(`${this.apiUrl}/api/admin/dashboard`, {
      headers: this.headers()
    });
  }

  getReports(status?: string, page = 1, limit = 20): Observable<{ reports: ReportItem[]; total: number }> {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    if (status) params = params.set('status', status);
    return this.http.get<{ reports: ReportItem[]; total: number }>(`${this.apiUrl}/api/admin/reports`, {
      headers: this.headers(),
      params
    });
  }

  getReportDetail(id: string): Observable<ReportItem> {
    return this.http.get<ReportItem>(`${this.apiUrl}/api/admin/reports/${id}`, {
      headers: this.headers()
    });
  }

  updateReport(id: string, action: string): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(`${this.apiUrl}/api/admin/reports/${id}`, { action }, {
      headers: this.headers()
    });
  }

  getConfig(): Observable<AdminConfig> {
    return this.http.get<AdminConfig>(`${this.apiUrl}/api/admin/config`, {
      headers: this.headers()
    });
  }

  updateConfig(config: Partial<AdminConfig>): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.apiUrl}/api/admin/config`, config, {
      headers: this.headers()
    });
  }

  getSessions(page = 1, limit = 30): Observable<{ sessions: SessionItem[]; total: number }> {
    const params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    return this.http.get<{ sessions: SessionItem[]; total: number }>(`${this.apiUrl}/api/admin/sessions`, {
      headers: this.headers(),
      params
    });
  }

  getLogs(action?: string, page = 1, limit = 50): Observable<{ logs: LogItem[]; total: number }> {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    if (action) params = params.set('action', action);
    return this.http.get<{ logs: LogItem[]; total: number }>(`${this.apiUrl}/api/admin/logs`, {
      headers: this.headers(),
      params
    });
  }

  getPayments(
    filters: { status?: string; userId?: string; orderId?: string },
    page = 1,
    limit = 20
  ): Observable<{ payments: PaymentItem[]; total: number }> {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    if (filters.status) params = params.set('status', filters.status);
    if (filters.userId) params = params.set('userId', filters.userId);
    if (filters.orderId) params = params.set('orderId', filters.orderId);
    return this.http.get<{ payments: PaymentItem[]; total: number }>(`${this.apiUrl}/api/admin/payments`, {
      headers: this.headers(),
      params
    });
  }

  syncPayment(orderId: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.apiUrl}/api/admin/payments/${orderId}/sync`,
      {},
      { headers: this.headers() }
    );
  }

  topupCoins(userId: string, coins: number): Observable<{ message: string; coinBalance: number; addedCoins: number }> {
    return this.http.post<{ message: string; coinBalance: number; addedCoins: number }>(
      `${this.apiUrl}/api/admin/topup-coins`,
      { userId, coins },
      { headers: this.headers() }
    );
  }

  isAdmin(): boolean {
    const u = this.auth.getUser();
    return !!u && (u.role === 'admin' || (u as any).role === 'admin');
  }
}
