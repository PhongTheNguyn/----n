import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject } from 'rxjs';
import { getWsUrl } from '../core/api-config';
import { AuthService } from './auth.service';

export type MatchStatus = 'idle' | 'searching' | 'connected';

export interface MatchFilters {
  gender: string;
  country: string;
}

@Injectable({ providedIn: 'root' })
export class MatchingService {
  private socket: Socket | null = null;

  private matched$ = new Subject<{ roomId: string; peerId: string; peerUserId: string; isInitiator: boolean }>();
  private searching$ = new Subject<void>();
  private peerSkipped$ = new Subject<void>();
  private peerEnded$ = new Subject<void>();
  private peerDisconnected$ = new Subject<void>();

  constructor(private auth: AuthService) {}

  connect(): Socket | null {
    const token = this.auth.getToken();
    if (!token || this.socket?.connected) return this.socket;

    this.socket = io(getWsUrl(), {
      auth: { token }
    });

    this.socket.on('matched', (data: { roomId: string; peerId: string; peerUserId?: string; isInitiator: boolean }) => {
      this.matched$.next({ ...data, peerUserId: data.peerUserId || '' });
    });

    this.socket.on('searching', () => {
      this.searching$.next();
    });

    this.socket.on('peer-skipped', () => {
      this.peerSkipped$.next();
    });

    this.socket.on('peer-ended', () => {
      this.peerEnded$.next();
    });

    this.socket.on('peer-disconnected', () => {
      this.peerDisconnected$.next();
    });

    return this.socket;
  }

  disconnect(): void {
    this.socket?.disconnect();
  }

  joinQueue(filters: MatchFilters): void {
    this.connect();
    this.socket?.emit('join-queue', filters);
  }

  leaveQueue(): void {
    this.socket?.emit('leave-queue');
  }

  sendOffer(roomId: string, offer: RTCSessionDescriptionInit): void {
    this.socket?.emit('offer', { roomId, offer });
  }

  sendAnswer(roomId: string, answer: RTCSessionDescriptionInit): void {
    this.socket?.emit('answer', { roomId, answer });
  }

  sendIceCandidate(roomId: string, candidate: RTCIceCandidateInit): void {
    this.socket?.emit('ice-candidate', { roomId, candidate });
  }

  skip(roomId: string): void {
    this.socket?.emit('skip', roomId);
  }

  endCall(roomId: string): void {
    this.socket?.emit('end-call', roomId);
  }

  onMatched(): Observable<{ roomId: string; peerId: string; peerUserId: string; isInitiator: boolean }> {
    return this.matched$.asObservable();
  }

  onSearching(): Observable<void> {
    return this.searching$.asObservable();
  }

  onPeerSkipped(): Observable<void> {
    return this.peerSkipped$.asObservable();
  }

  onPeerEnded(): Observable<void> {
    return this.peerEnded$.asObservable();
  }

  onPeerDisconnected(): Observable<void> {
    return this.peerDisconnected$.asObservable();
  }

  onOffer(): Observable<{ offer: RTCSessionDescriptionInit; from: string }> {
    return new Observable((sub) => {
      this.socket?.on('offer', (data: { offer: RTCSessionDescriptionInit; from: string }) => {
        sub.next(data);
      });
      return () => this.socket?.off('offer');
    });
  }

  onAnswer(): Observable<{ answer: RTCSessionDescriptionInit; from: string }> {
    return new Observable((sub) => {
      this.socket?.on('answer', (data: { answer: RTCSessionDescriptionInit; from: string }) => {
        sub.next(data);
      });
      return () => this.socket?.off('answer');
    });
  }

  onIceCandidate(): Observable<{ candidate: RTCIceCandidateInit; from: string }> {
    return new Observable((sub) => {
      this.socket?.on('ice-candidate', (data: { candidate: RTCIceCandidateInit; from: string }) => {
        sub.next(data);
      });
      return () => this.socket?.off('ice-candidate');
    });
  }
}
