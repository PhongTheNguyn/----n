import { environment } from '../../environments/environment';

function hasProtocol(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function getDynamicBaseUrl(port: number): string {
  if (typeof window === 'undefined') {
    return `http://localhost:${port}`;
  }

  const { protocol, hostname } = window.location;
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
  const normalizedProtocol = protocol === 'https:' ? 'https:' : 'http:';
  const fallbackHost = isLocalHost ? 'localhost' : hostname;

  return `${normalizedProtocol}//${fallbackHost}:${port}`;
}

export function getApiUrl(): string {
  if (hasProtocol(environment.apiUrl)) {
    return environment.apiUrl;
  }
  return getDynamicBaseUrl(3000);
}

export function getWsUrl(): string {
  if (hasProtocol(environment.wsUrl)) {
    return environment.wsUrl;
  }
  return getDynamicBaseUrl(3000);
}