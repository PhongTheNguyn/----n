import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { Router } from '@angular/router';
import { getApiUrl } from '../core/api-config';

const TOKEN_KEY = 'video_call_token';
const USER_KEY = 'video_call_user';

export interface User {
  id: string;
  email: string;
  displayName: string;
  gender: string;
  country: string;
  age: number;
  bio?: string;
  avatarUrl?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private get apiUrl(): string {
    return getApiUrl();
  }

  constructor(
    private http: HttpClient,
    private router: Router
  ) {}

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/api/auth/login`, { email, password }).pipe(
      tap((res) => {
        this.setToken(res.token);
        this.setUser(res.user);
      })
    );
  }

  register(data: {
    fullName: string;
    email: string;
    password: string;
    confirmPassword: string;
    gender: string;
    country: string;
    age: number;
    agreeTerms: boolean;
  }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/api/auth/register`, data).pipe(
      tap((res) => {
        this.setToken(res.token);
        this.setUser(res.user);
      })
    );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  getUser(): User | null {
    const u = localStorage.getItem(USER_KEY);
    return u ? JSON.parse(u) : null;
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  private setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  }

  private setUser(user: User): void {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  updateStoredUser(user: Partial<User>): void {
    const current = this.getUser();
    if (current) {
      this.setUser({ ...current, ...user });
    }
  }
}
