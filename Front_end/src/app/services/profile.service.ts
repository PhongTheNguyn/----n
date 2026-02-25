import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService, User } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private apiUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) {}

  private headers(): HttpHeaders {
    const token = this.auth.getToken();
    return new HttpHeaders({
      Authorization: token ? `Bearer ${token}` : ''
    });
  }

  getProfile(): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/api/user/profile`, {
      headers: this.headers()
    });
  }

  updateProfile(data: Partial<Pick<User, 'displayName' | 'gender' | 'country' | 'age' | 'bio'>>): Observable<User> {
    return this.http.put<User>(`${this.apiUrl}/api/user/profile`, data, {
      headers: this.headers()
    });
  }

  uploadAvatar(file: File): Observable<{ avatarUrl: string }> {
    const formData = new FormData();
    formData.append('avatar', file);
    return this.http.post<{ avatarUrl: string }>(`${this.apiUrl}/api/user/avatar`, formData, {
      headers: this.headers()
    });
  }
}
