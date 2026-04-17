import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject, fromEvent } from 'rxjs';
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

  private offerSubject = new Subject<{ offer: RTCSessionDescriptionInit; from: string }>();
  private answerSubject = new Subject<{ answer: RTCSessionDescriptionInit; from: string }>();
  private iceCandidateSubject = new Subject<{ candidate: RTCIceCandidateInit; from: string }>();

  private socketInitialized = false;

  constructor(private auth: AuthService) {}

  private initSocketListeners(): void {
    if (this.socketInitialized || !this.socket) return;

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

    this.socket.on('offer', (data: { offer: RTCSessionDescriptionInit; from: string }) => {
      this.offerSubject.next(data);
    });

    this.socket.on('answer', (data: { answer: RTCSessionDescriptionInit; from: string }) => {
      this.answerSubject.next(data);
    });

    this.socket.on('ice-candidate', (data: { candidate: RTCIceCandidateInit; from: string }) => {
      this.iceCandidateSubject.next(data);
    });

    this.socketInitialized = true;
  }

  connect(): Socket | null {
    const token = this.auth.getToken();
    if (!token) return null;

    if (this.socket?.connected) {
      return this.socket;
    }

    this.socket = io(getWsUrl(), {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket?.id);
    });

    this.socket.on('connect_error', (err) => {
      console.error('Socket connect error:', err.message);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      this.socketInitialized = false;
    });

    this.initSocketListeners();

    return this.socket;
  }

  disconnect(): void {
    this.socketInitialized = false;
    this.socket?.disconnect();
    this.socket = null;
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
    this.connect();
    return this.matched$.asObservable();
  }

  onSearching(): Observable<void> {
    this.connect();
    return this.searching$.asObservable();
  }

  onPeerSkipped(): Observable<void> {
    this.connect();
    return this.peerSkipped$.asObservable();
  }

  onPeerEnded(): Observable<void> {
    this.connect();
    return this.peerEnded$.asObservable();
  }

  onPeerDisconnected(): Observable<void> {
    this.connect();
    return this.peerDisconnected$.asObservable();
  }

  onOffer(): Observable<{ offer: RTCSessionDescriptionInit; from: string }> {
    this.connect();
    return this.offerSubject.asObservable();
  }

  onAnswer(): Observable<{ answer: RTCSessionDescriptionInit; from: string }> {
    this.connect();
    return this.answerSubject.asObservable();
  }

  onIceCandidate(): Observable<{ candidate: RTCIceCandidateInit; from: string }> {
    this.connect();
    return this.iceCandidateSubject.asObservable();
  }
}
