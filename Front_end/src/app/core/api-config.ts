import { environment } from '../../environments/environment';

/**
 * API base URL. On LAN (hostname !== localhost) uses http://<hostname>:3000
 * so the second machine can connect to the host's backend.
 */
export function getApiUrl(): string {
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return `http://${window.location.hostname}:3000`;
  }
  return environment.apiUrl || '';
}

/**
 * WebSocket (Socket.IO) URL. On LAN uses http://<hostname>:3000
 * so the second machine connects to the host's backend.
 */
export function getWsUrl(): string {
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return `http://${window.location.hostname}:3000`;
  }
  return environment.wsUrl || 'http://localhost:3000';
}
