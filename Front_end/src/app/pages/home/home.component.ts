import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../services/auth.service';
import { MatchingService } from '../../services/matching.service';
import { ReportBlockService } from '../../services/report-block.service';
import { AdminService } from '../../services/admin.service';
import { ReportDialogComponent } from '../../components/report-dialog/report-dialog.component';
import { getApiUrl } from '../../core/api-config';

enum MatchingStatus {
  IDLE = 'idle',
  SEARCHING = 'searching',
  CONNECTED = 'connected'
}

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, OnDestroy {
  @ViewChild('localVideo') localVideoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo') remoteVideoRef!: ElementRef<HTMLVideoElement>;

  filterForm: FormGroup;
  matchingStatus: MatchingStatus = MatchingStatus.IDLE;
  isMicMuted = false;
  isCameraOff = false;
  roomId: string | null = null;
  peerUserId: string | null = null;
  isInitiator = false;
  localStream: MediaStream | null = null;
  peerConnection: RTCPeerConnection | null = null;

  private destroy$ = new Subject<void>();
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private config: RTCConfiguration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  };

  genders = [
    { value: 'all', label: 'Tất cả' },
    { value: 'male', label: 'Nam' },
    { value: 'female', label: 'Nữ' },
    { value: 'other', label: 'Khác' }
  ];

  countries = [
    { value: 'all', label: 'Tất cả quốc gia' },
    { value: 'vn', label: 'Việt Nam' },
    { value: 'us', label: 'United States' },
    { value: 'uk', label: 'United Kingdom' },
    { value: 'jp', label: 'Japan' },
    { value: 'kr', label: 'South Korea' },
    { value: 'cn', label: 'China' },
    { value: 'th', label: 'Thailand' },
    { value: 'sg', label: 'Singapore' }
  ];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private auth: AuthService,
    private matching: MatchingService,
    private reportBlock: ReportBlockService,
    private admin: AdminService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {
    this.filterForm = this.fb.group({
      gender: ['all'],
      country: ['all']
    });
  }

  ngOnInit() {
    this.setupSocketListeners();
  }

  private setupSocketListeners(): void {
    this.matching.onMatched()
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ roomId, peerUserId, isInitiator }) => {
        console.log('[HomeComponent] Matched:', { roomId, peerUserId, isInitiator });
        this.roomId = roomId;
        this.peerUserId = peerUserId || null;
        this.isInitiator = isInitiator;
        this.matchingStatus = MatchingStatus.CONNECTED;
        this.setupPeerConnection();
      });

    this.matching.onSearching()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        console.log('[HomeComponent] Searching...');
        this.matchingStatus = MatchingStatus.SEARCHING;
      });

    this.matching.onPeerSkipped()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        console.log('[HomeComponent] Peer skipped');
        this.handlePeerLeft();
      });

    this.matching.onPeerEnded()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        console.log('[HomeComponent] Peer ended call');
        this.handlePeerLeft();
      });

    this.matching.onPeerDisconnected()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        console.log('[HomeComponent] Peer disconnected');
        this.handlePeerLeft();
      });

    this.matching.onOffer()
      .pipe(takeUntil(this.destroy$))
      .subscribe(async (data) => {
        console.log('[HomeComponent] Received offer');
        if (!this.roomId || !this.peerConnection) {
          console.warn('[HomeComponent] Ignoring offer - no room or peerConnection');
          return;
        }

        try {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

          for (const c of this.pendingCandidates) {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(c));
          }
          this.pendingCandidates = [];

          const answer = await this.peerConnection.createAnswer();
          await this.peerConnection.setLocalDescription(answer);
          this.matching.sendAnswer(this.roomId, answer);
          console.log('[HomeComponent] Sent answer');
        } catch (err) {
          console.error('[HomeComponent] Error handling offer:', err);
        }
      });

    this.matching.onAnswer()
      .pipe(takeUntil(this.destroy$))
      .subscribe(async (data) => {
        console.log('[HomeComponent] Received answer');
        if (!this.peerConnection) {
          console.warn('[HomeComponent] Ignoring answer - no peerConnection');
          return;
        }

        try {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));

          for (const c of this.pendingCandidates) {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(c));
          }
          this.pendingCandidates = [];
        } catch (err) {
          console.error('[HomeComponent] Error handling answer:', err);
        }
      });

    this.matching.onIceCandidate()
      .pipe(takeUntil(this.destroy$))
      .subscribe(async (data) => {
        if (!this.peerConnection) {
          console.warn('[HomeComponent] Ignoring ICE candidate - no peerConnection');
          return;
        }

        try {
          if (!this.peerConnection.remoteDescription) {
            console.log('[HomeComponent] Queueing ICE candidate (no remote description yet)');
            this.pendingCandidates.push(data.candidate);
            return;
          }

          await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
          console.error('[HomeComponent] Error adding ICE candidate:', err);
        }
      });
  }

  ngOnDestroy() {
    this.cleanup();
    this.destroy$.next();
    this.destroy$.complete();
  }

  async startMatching() {
    if (this.matchingStatus === MatchingStatus.SEARCHING) return;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.snackBar.open(
        'Trình duyệt không hỗ trợ camera/micro hoặc cần truy cập qua HTTPS/localhost. Hãy dùng Chrome/Firefox và mở qua localhost hoặc HTTPS.',
        'Đóng',
        { duration: 6000 }
      );
      return;
    }

    try {
      console.log('[HomeComponent] Requesting camera/mic...');
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        }
      });

      console.log('[HomeComponent] Got local stream:', {
        videoTracks: this.localStream.getVideoTracks().length,
        audioTracks: this.localStream.getAudioTracks().length
      });

      this.attachLocalStream();
      this.matchingStatus = MatchingStatus.SEARCHING;
      this.matching.joinQueue(this.filterForm.value);
    } catch (err: any) {
      console.error('[HomeComponent] getUserMedia failed:', err);
      let errorMsg = 'Không thể truy cập camera/micro. ';
      if (err.name === 'NotAllowedError') {
        errorMsg += 'Quyền truy cập bị từ chối. Vui lòng cho phép truy cập camera/micro trong trình duyệt.';
      } else if (err.name === 'NotFoundError') {
        errorMsg += 'Không tìm thấy camera/micro.';
      } else if (err.name === 'NotReadableError') {
        errorMsg += 'Camera/micro đang được sử dụng bởi ứng dụng khác.';
      } else {
        errorMsg += 'Kiểm tra quyền trình duyệt hoặc thử mở qua https:// hoặc localhost.';
      }
      this.snackBar.open(errorMsg, 'Đóng', { duration: 5000 });
    }
  }

  stopMatching() {
    if (this.roomId) {
      this.matching.endCall(this.roomId);
    }
    this.cleanup();
    this.matching.leaveQueue();
    this.matchingStatus = MatchingStatus.IDLE;
  }

  nextMatch() {
    if (this.roomId) {
      this.matching.skip(this.roomId);
    }
    this.resetPeerState();
    this.matchingStatus = MatchingStatus.SEARCHING;
    this.matching.joinQueue(this.filterForm.value);
  }

  toggleMic() {
    this.isMicMuted = !this.isMicMuted;
    this.localStream?.getAudioTracks().forEach((t) => (t.enabled = !this.isMicMuted));
  }

  toggleCamera() {
    this.isCameraOff = !this.isCameraOff;
    this.localStream?.getVideoTracks().forEach((t) => (t.enabled = !this.isCameraOff));
  }

  goToProfile() {
    this.router.navigate(['/profile']);
  }

  logout() {
    this.cleanup();
    this.matching.disconnect();
    this.auth.logout();
  }

  openReportDialog() {
    if (!this.peerUserId) return;
    const ref = this.dialog.open(ReportDialogComponent, {
      width: '400px',
      data: { reportedDisplayName: 'Người lạ' }
    });
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.reportBlock.report(this.peerUserId!, result.reason, result.description).subscribe({
        next: () => {
          this.snackBar.open('Báo cáo đã được gửi', 'Đóng', { duration: 3000 });
        },
        error: (err) => {
          this.snackBar.open(err.error?.error || 'Gửi báo cáo thất bại', 'Đóng', { duration: 3000 });
        }
      });
    });
  }

  blockUser() {
    if (!this.peerUserId) return;
    this.reportBlock.block(this.peerUserId).subscribe({
      next: () => {
        this.snackBar.open('Đã chặn người dùng', 'Đóng', { duration: 3000 });
        this.nextMatch();
      },
      error: (err) => {
        this.snackBar.open(err.error?.error || 'Chặn thất bại', 'Đóng', { duration: 3000 });
      }
    });
  }

  get statusText(): string {
    switch (this.matchingStatus) {
      case MatchingStatus.SEARCHING:
        return 'Đang tìm kiếm...';
      case MatchingStatus.CONNECTED:
        return 'Đã kết nối';
      default:
        return 'Sẵn sàng ghép cặp';
    }
  }

  get isSearching(): boolean {
    return this.matchingStatus === MatchingStatus.SEARCHING;
  }

  get isConnected(): boolean {
    return this.matchingStatus === MatchingStatus.CONNECTED;
  }

  get isIdle(): boolean {
    return this.matchingStatus === MatchingStatus.IDLE;
  }

  get isAdmin(): boolean {
    return this.admin.isAdmin();
  }

  private attachLocalStream() {
    setTimeout(() => {
      const el = this.localVideoRef?.nativeElement;
      if (el && this.localStream) {
        el.muted = true;
        el.volume = 0;
        el.srcObject = this.localStream;
        // Ensure video plays
        el.play().catch(err => console.warn('Local video play failed:', err));
      }
    }, 0);
  }

  private async setupPeerConnection() {
    // Fetch TURN credentials if available
    const token = this.auth.getToken();

    if (token) {
      try {
        const res = await fetch(`${getApiUrl()}/api/webrtc/turn-credentials`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
            this.config.iceServers = data.iceServers;
            console.log('[HomeComponent] Loaded TURN servers:', data.iceServers.length);
          } else {
            console.warn('[HomeComponent] No ICE servers in response');
          }
        } else {
          console.warn('[HomeComponent] TURN credentials fetch failed:', res.status);
        }
      } catch (e: any) {
        console.warn('[HomeComponent] TURN fetch error:', e.message);
      }
    }

    this.pendingCandidates = [];

    // Close existing connection if any
    if (this.peerConnection) {
      this.peerConnection.close();
    }

    this.peerConnection = new RTCPeerConnection(this.config);

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });
    }

    // Handle remote track
    this.peerConnection.ontrack = (event) => {
      console.log('[HomeComponent] Remote track received');
      const el = this.remoteVideoRef?.nativeElement;
      if (el && event.streams[0]) {
        el.srcObject = event.streams[0];
        el.play().catch(err => console.warn('Remote video play failed:', err));
      }
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.roomId) {
        this.matching.sendIceCandidate(this.roomId, event.candidate.toJSON());
      }
    };

    // Monitor ICE connection state
    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('[HomeComponent] ICE connection state:', this.peerConnection?.iceConnectionState);
      if (this.peerConnection?.iceConnectionState === 'failed') {
        console.error('[HomeComponent] ICE connection failed - network issue or TURN unreachable');
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      console.log('[HomeComponent] Connection state:', this.peerConnection?.connectionState);
    };

    // If initiator, create and send offer
    if (this.roomId && this.isInitiator) {
      try {
        const offer = await this.peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        await this.peerConnection.setLocalDescription(offer);
        this.matching.sendOffer(this.roomId, offer);
        console.log('[HomeComponent] Sent offer');
      } catch (err) {
        console.error('[HomeComponent] Failed to create offer:', err);
      }
    }
  }

  private handlePeerLeft() {
    this.resetPeerState();
    this.matchingStatus = MatchingStatus.SEARCHING;
    this.matching.joinQueue(this.filterForm.value);
  }

  private resetPeerState() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.roomId = null;
    this.peerUserId = null;
    const rv = this.remoteVideoRef?.nativeElement;
    if (rv) rv.srcObject = null;
  }

  private cleanup() {
    this.resetPeerState();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        track.stop();
        track.enabled = false;
      });
      this.localStream = null;
    }

    const lv = this.localVideoRef?.nativeElement;
    if (lv) {
      lv.srcObject = null;
      lv.pause();
    }

    this.isMicMuted = false;
    this.isCameraOff = false;
  }
}