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

  private matched$ = new Subject<{
    roomId: string;
    peerId: string;
    peerUserId: string;
    peerDisplayName?: string | null;
    peerAvatarUrl?: string | null;
    isInitiator: boolean;
  }>();
  private searching$ = new Subject<void>();
  private peerSkipped$ = new Subject<void>();
  private peerEnded$ = new Subject<void>();
  private peerDisconnected$ = new Subject<void>();
  private walletUpdated$ = new Subject<{ coinBalance: number; chargedCoins?: number; durationSeconds?: number; type?: string }>();
  private billingError$ = new Subject<{ message: string; coinBalance?: number; filterCost?: number }>();
  private peerCameraState$ = new Subject<{ isCameraOff: boolean; from: string }>();
  private peerChatMessage$ = new Subject<{ text: string; from: string; sentAt: number }>();

  constructor(private auth: AuthService) {}

  connect(): Socket | null {
    const token = this.auth.getToken();
    if (!token || this.socket?.connected) return this.socket;

    this.socket = io(getWsUrl(), {
      auth: { token }
    });

    this.socket.on('matched', (data: {
      roomId: string;
      peerId: string;
      peerUserId?: string;
      peerDisplayName?: string | null;
      peerAvatarUrl?: string | null;
      isInitiator: boolean;
    }) => {
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

    this.socket.on('wallet-updated', (data: { coinBalance: number; chargedCoins?: number; durationSeconds?: number; type?: string }) => {
      this.walletUpdated$.next(data);
    });

    this.socket.on('billing-error', (data: { message: string; coinBalance?: number; filterCost?: number }) => {
      this.billingError$.next(data);
    });

    this.socket.on('peer-camera-state', (data: { isCameraOff: boolean; from: string }) => {
      this.peerCameraState$.next(data);
    });

    this.socket.on('peer-chat-message', (data: { text: string; from: string; sentAt: number }) => {
      this.peerChatMessage$.next(data);
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

  sendCameraState(roomId: string, isCameraOff: boolean): void {
    this.socket?.emit('camera-state', { roomId, isCameraOff });
  }

  sendChatMessage(roomId: string, text: string): void {
    this.socket?.emit('chat-message', { roomId, text });
  }

  skip(roomId: string): void {
    this.socket?.emit('skip', roomId);
  }

  endCall(roomId: string): void {
    this.socket?.emit('end-call', roomId);
  }

  onMatched(): Observable<{
    roomId: string;
    peerId: string;
    peerUserId: string;
    peerDisplayName?: string | null;
    peerAvatarUrl?: string | null;
    isInitiator: boolean;
  }> {
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

  onWalletUpdated(): Observable<{ coinBalance: number; chargedCoins?: number; durationSeconds?: number; type?: string }> {
    return this.walletUpdated$.asObservable();
  }

  onBillingError(): Observable<{ message: string; coinBalance?: number; filterCost?: number }> {
    return this.billingError$.asObservable();
  }

  onPeerCameraState(): Observable<{ isCameraOff: boolean; from: string }> {
    return this.peerCameraState$.asObservable();
  }

  onPeerChatMessage(): Observable<{ text: string; from: string; sentAt: number }> {
    return this.peerChatMessage$.asObservable();
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
