import { environment } from '../../environments/environment';

export function getApiUrl(): string {
  return environment.apiUrl;
}

export function getWsUrl(): string {
  return environment.wsUrl;
}