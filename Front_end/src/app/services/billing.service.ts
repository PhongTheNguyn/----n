import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { getApiUrl } from '../core/api-config';
import { AuthService } from './auth.service';

export interface BillingSummary {
  coinBalance: number;
  coinVndValue: number;
  freeCallSecondsPerDay: number;
  freeCallSecondsUsedToday: number;
  freeCallSecondsRemainingToday: number;
  paidCallSecondsToday: number;
  callBillingBlockSeconds: number;
  coinsPerCallBlock: number;
}

export interface CoinTransaction {
  id: string;
  amount: number;
  type: string;
  reason?: string | null;
  metadata?: unknown;
  created_at: string;
}

export interface ZaloPayPaymentStatus {
  orderId: string;
  amountVnd: number;
  coinAmount: number;
  status: string;
  returnCode?: number | null;
  zpTransId?: string | null;
  createdAt: string;
  paidAt?: string | null;
}

@Injectable({ providedIn: 'root' })
export class BillingService {
  private get apiUrl(): string {
    return getApiUrl();
  }

  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) {}

  private headers(): { [k: string]: string } {
    const token = this.auth.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  getMySummary(): Observable<BillingSummary> {
    return this.http.get<BillingSummary>(`${this.apiUrl}/api/user/billing-summary`, {
      headers: this.headers()
    });
  }

  getMyTransactions(limit = 20): Observable<{ transactions: CoinTransaction[] }> {
    return this.http.get<{ transactions: CoinTransaction[] }>(
      `${this.apiUrl}/api/user/coin-transactions?limit=${limit}`,
      { headers: this.headers() }
    );
  }

  createZaloPayPayment(coins: number): Observable<{ payUrl: string; orderId: string }> {
    return this.http.post<{ payUrl: string; orderId: string }>(
      `${this.apiUrl}/api/payment/zalopay/create`,
      { coins },
      { headers: this.headers() }
    );
  }

  getZaloPayPaymentStatus(orderId: string): Observable<ZaloPayPaymentStatus> {
    return this.http.get<ZaloPayPaymentStatus>(`${this.apiUrl}/api/payment/zalopay/${orderId}`, {
      headers: this.headers()
    });
  }

  queryZaloPayOrder(orderId: string): Observable<{ return_code: number }> {
    return this.http.post<{ return_code: number }>(
      `${this.apiUrl}/api/payment/zalopay/${orderId}/query`,
      {},
      { headers: this.headers() }
    );
  }
}
