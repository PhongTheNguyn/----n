import { Component, OnInit, OnDestroy, ViewChild, ElementRef, HostListener } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
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

interface ChatMessage {
  text: string;
  mine: boolean;
  sentAt: number;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, OnDestroy {
  @ViewChild('localVideo') localVideoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo') remoteVideoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('desktopChatMessages') desktopChatMessagesRef?: ElementRef<HTMLDivElement>;
  @ViewChild('mobileChatMessages') mobileChatMessagesRef?: ElementRef<HTMLDivElement>;

  filterForm: FormGroup;
  matchingStatus: MatchingStatus = MatchingStatus.IDLE;
  isMicMuted = false;
  isCameraOff = false;
  roomId: string | null = null;
  peerUserId: string | null = null;
  peerDisplayName = '';
  peerAvatarUrlValue = '';
  networkQualityLabel = 'Đang kết nối...';
  isInitiator = false;
  localStream: MediaStream | null = null;
  peerConnection: RTCPeerConnection | null = null;
  readonly defaultAvatarUrl = 'assets/default-avatar.svg';
  micBars = [0.12, 0.12, 0.12, 0.12, 0.12];
  peerMicBars = [0.12, 0.12, 0.12, 0.12, 0.12];
  isPeerCameraOff = false;
  chatMessages: ChatMessage[] = [];
  chatDraft = '';
  unreadChatCount = 0;
  showPeerIntro = false;
  peerIntroName = 'Đối phương';
  showPeerActionMenu = false;
  isMobileView = false;
  isChatBubbleOpen = false;
  chatBubblePos = { x: 16, y: 180 };
  private peerCameraOffSignaled: boolean | null = null;
  private bubbleDragPointerId: number | null = null;
  private bubbleDragStart = { x: 0, y: 0, bx: 16, by: 180 };
  private bubbleDragMoved = false;
  private peerIntroTimeout: ReturnType<typeof setTimeout> | null = null;
  private cameraStateSyncInterval: ReturnType<typeof setInterval> | null = null;
  private localVideoTrack: MediaStreamTrack | null = null;
  private videoSender: RTCRtpSender | null = null;
  private originalBodyOverflow = '';
  private originalHtmlOverflow = '';
  private subs: Subscription[] = [];
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micData: Uint8Array | null = null;
  private micAnimFrame: number | null = null;
  private remoteStream: MediaStream | null = null;
  private peerAudioContext: AudioContext | null = null;
  private peerAnalyser: AnalyserNode | null = null;
  private peerMicSource: MediaStreamAudioSourceNode | null = null;
  private peerMicData: Uint8Array | null = null;
  private peerMicAnimFrame: number | null = null;
  private readonly onVisibilityOrPageHidden = () => {
    this.sendCurrentCameraState();
  };
  private config: RTCConfiguration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  };

  genders = [
    { value: 'all', label: 'Tất cả' },
    { value: 'male', label: 'Nam' },
    { value: 'female', label: 'Nữ' }
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
    this.lockPageScroll();
    this.updateViewportState();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityOrPageHidden);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.onVisibilityOrPageHidden);
      window.addEventListener('pageshow', this.onVisibilityOrPageHidden);
      window.addEventListener('focus', this.onVisibilityOrPageHidden);
      window.addEventListener('blur', this.onVisibilityOrPageHidden);
    }
    this.subs.push(
      this.matching.onMatched().subscribe(({ roomId, peerUserId, peerDisplayName, peerAvatarUrl, isInitiator }) => {
        this.roomId = roomId;
        this.peerUserId = peerUserId || null;
        this.peerDisplayName = (peerDisplayName || '').trim() || (this.peerUserId ? this.peerUserId.slice(0, 6) : '');
        this.peerAvatarUrlValue = (peerAvatarUrl || '').trim();
        this.isInitiator = isInitiator;
        this.matchingStatus = MatchingStatus.CONNECTED;
        // Show avatar overlay immediately until remote video really arrives.
        this.isPeerCameraOff = true;
        this.showPeerMatchedIntro();
        this.setupPeerConnection();
        this.startCameraStateSync();
      }),
      this.matching.onSearching().subscribe(() => {
        this.matchingStatus = MatchingStatus.SEARCHING;
        this.networkQualityLabel = 'Đang kết nối...';
      }),
      this.matching.onPeerSkipped().subscribe(() => this.handlePeerLeft()),
      this.matching.onPeerEnded().subscribe(() => this.handlePeerLeft()),
      this.matching.onPeerDisconnected().subscribe(() => this.handlePeerLeft()),
      this.matching.onPeerCameraState().subscribe(({ isCameraOff }) => {
        this.peerCameraOffSignaled = isCameraOff;
        this.isPeerCameraOff = isCameraOff;
      }),
      this.matching.onPeerChatMessage().subscribe(({ text, sentAt }) => {
        this.pushChatMessage(text, false, sentAt);
        if (this.isMobileView && !this.isChatBubbleOpen) {
          this.unreadChatCount += 1;
        }
      })
    );
  }

  ngOnDestroy() {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityOrPageHidden);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.onVisibilityOrPageHidden);
      window.removeEventListener('pageshow', this.onVisibilityOrPageHidden);
      window.removeEventListener('focus', this.onVisibilityOrPageHidden);
      window.removeEventListener('blur', this.onVisibilityOrPageHidden);
    }
    this.detachLocalVideoTrackListeners();
    this.terminateSession(true);
    this.unlockPageScroll();
    this.cleanup();
    this.subs.forEach((s) => s.unsubscribe());
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.updateViewportState();
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
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false
        }
      });
      this.attachLocalStream();
      this.startMicVisualizer();
      this.matchingStatus = MatchingStatus.SEARCHING;
      this.matching.joinQueue(this.filterForm.value);
    } catch (err) {
      console.error('getUserMedia failed:', err);
      this.snackBar.open(
        'Không thể truy cập camera/micro. Kiểm tra quyền trình duyệt hoặc thử mở qua https:// hoặc localhost.',
        'Đóng',
        { duration: 5000 }
      );
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

  async toggleCamera() {
    if (!this.localStream) return;

    // Turn off camera for real: stop track so hardware LED can go off.
    if (!this.isCameraOff) {
      const currentVideoTrack = this.localStream.getVideoTracks()[0];
      if (currentVideoTrack) {
        this.localStream.removeTrack(currentVideoTrack);
        currentVideoTrack.stop();
      }
      await this.replaceVideoSenderTrack(null);
      this.isCameraOff = true;
      this.attachLocalStream();
      this.sendCurrentCameraState();
      return;
    }

    // Turn camera back on by getting a fresh video track.
    try {
      const videoOnlyStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const newVideoTrack = videoOnlyStream.getVideoTracks()[0];
      if (!newVideoTrack) return;

      this.localStream.addTrack(newVideoTrack);
      await this.replaceVideoSenderTrack(newVideoTrack);
      this.isCameraOff = false;
      this.attachLocalStream();
      this.sendCurrentCameraState();
    } catch (err) {
      console.error('Re-enable camera failed:', err);
      this.snackBar.open('Không thể bật lại camera. Kiểm tra quyền trình duyệt.', 'Đóng', { duration: 4000 });
    }
  }

  sendChatMessage() {
    const text = this.chatDraft.trim();
    if (!text || !this.roomId || !this.isConnected) return;
    this.matching.sendChatMessage(this.roomId, text);
    this.pushChatMessage(text, true, Date.now());
    this.chatDraft = '';
  }

  onChatEnter(event: Event) {
    event.preventDefault();
    this.sendChatMessage();
  }

  onChatBubblePointerDown(event: PointerEvent) {
    if (!this.isMobileView) return;
    this.bubbleDragPointerId = event.pointerId;
    this.bubbleDragMoved = false;
    this.bubbleDragStart = {
      x: event.clientX,
      y: event.clientY,
      bx: this.chatBubblePos.x,
      by: this.chatBubblePos.y
    };
    (event.currentTarget as HTMLElement)?.setPointerCapture?.(event.pointerId);
  }

  onChatBubblePointerMove(event: PointerEvent) {
    if (this.bubbleDragPointerId !== event.pointerId) return;
    const dx = event.clientX - this.bubbleDragStart.x;
    const dy = event.clientY - this.bubbleDragStart.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      this.bubbleDragMoved = true;
    }
    this.chatBubblePos = this.clampChatBubble({
      x: this.bubbleDragStart.bx + dx,
      y: this.bubbleDragStart.by + dy
    });
  }

  onChatBubblePointerUp(event: PointerEvent) {
    if (this.bubbleDragPointerId !== event.pointerId) return;
    this.bubbleDragPointerId = null;
    (event.currentTarget as HTMLElement)?.releasePointerCapture?.(event.pointerId);
    if (!this.bubbleDragMoved) {
      this.isChatBubbleOpen = !this.isChatBubbleOpen;
      if (this.isChatBubbleOpen) {
        this.unreadChatCount = 0;
        this.queueScrollChatToBottom();
      }
    }
  }

  onChatBubblePointerCancel(event: PointerEvent) {
    if (this.bubbleDragPointerId !== event.pointerId) return;
    this.bubbleDragPointerId = null;
    (event.currentTarget as HTMLElement)?.releasePointerCapture?.(event.pointerId);
  }

  closeChatBubble() {
    this.isChatBubbleOpen = false;
  }

  get chatWindowLeft(): number {
    if (typeof window === 'undefined') return 12;
    const panelWidth = Math.min(320, window.innerWidth - 24);
    const desired = this.chatBubblePos.x + 56 - panelWidth;
    return Math.min(Math.max(12, desired), Math.max(12, window.innerWidth - panelWidth - 12));
  }

  get chatWindowTop(): number {
    if (typeof window === 'undefined') return 80;
    const panelHeight = Math.min(360, window.innerHeight - 110);
    const desired = this.chatBubblePos.y - panelHeight - 12;
    return Math.min(Math.max(70, desired), Math.max(70, window.innerHeight - panelHeight - 12));
  }

  goToProfile() {
    this.terminateSession(true);
    this.router.navigate(['/profile']);
  }

  logout() {
    this.terminateSession(true);
    this.cleanup();
    this.auth.logout();
  }

  openReportDialog() {
    if (!this.peerUserId) return;
    const ref = this.dialog.open(ReportDialogComponent, {
      width: '400px',
      data: { reportedDisplayName: 'Đối phương' }
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

  togglePeerActionMenu(event?: Event) {
    event?.stopPropagation();
    this.showPeerActionMenu = !this.showPeerActionMenu;
  }

  closePeerActionMenu() {
    this.showPeerActionMenu = false;
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

  get peerDisplayLabel(): string {
    return '';
  }

  get localAvatarUrl(): string {
    return this.auth.getUser()?.avatarUrl || this.defaultAvatarUrl;
  }

  get peerAvatarUrl(): string {
    return this.peerAvatarUrlValue || this.defaultAvatarUrl;
  }

  onAvatarError(event: Event) {
    const img = event.target as HTMLImageElement;
    if (img && img.src !== this.defaultAvatarUrl) {
      img.src = this.defaultAvatarUrl;
    }
  }

  private attachLocalStream() {
    this.attachLocalVideoTrackListeners();
    setTimeout(() => {
      const el = this.localVideoRef?.nativeElement;
      if (el && this.localStream) {
        // Ensure local preview never plays back captured microphone.
        el.muted = true;
        el.volume = 0;
        el.srcObject = this.localStream;
      }
    }, 0);
  }

  private startMicVisualizer() {
    this.stopMicVisualizer();
    if (!this.localStream || typeof window === 'undefined') return;

    const audioTracks = this.localStream.getAudioTracks();
    if (!audioTracks.length) return;

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    this.audioContext = new AudioCtx();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.65;
    this.micData = new Uint8Array(this.analyser.frequencyBinCount);
    this.micSource = this.audioContext.createMediaStreamSource(this.localStream);
    this.micSource.connect(this.analyser);
    this.audioContext.resume().catch(() => {});

    const tick = () => {
      if (!this.analyser || !this.micData) return;
      this.analyser.getByteFrequencyData(this.micData as any);

      // Emphasize speaking frequencies (~300Hz-3kHz) for clearer movement.
      let sum = 0;
      let count = 0;
      for (let i = 2; i < Math.min(this.micData.length, 48); i += 1) {
        sum += this.micData[i];
        count += 1;
      }
      const avg = count ? sum / count : 0;
      // Add a small noise gate and reduce sensitivity when camera is off
      // so mic bars do not look constantly high in that state.
      const noiseFloor = this.isCameraOff ? 14 : 10;
      const normalized = Math.max(0, avg - noiseFloor);
      const sensitivityDivisor = this.isCameraOff ? 62 : 52;
      const level = Math.min(1, normalized / sensitivityDivisor);
      const base = this.isMicMuted ? 0.06 : 0.14;
      const pattern = [0.55, 0.75, 1, 0.75, 0.55];
      this.micBars = pattern.map((weight) => Math.min(1, base + level * weight));
      this.micAnimFrame = window.requestAnimationFrame(tick);
    };

    tick();
  }

  private stopMicVisualizer() {
    if (typeof window !== 'undefined' && this.micAnimFrame != null) {
      window.cancelAnimationFrame(this.micAnimFrame);
    }
    this.micAnimFrame = null;
    this.micBars = [0.12, 0.12, 0.12, 0.12, 0.12];

    this.micSource?.disconnect();
    this.analyser?.disconnect();
    this.micSource = null;
    this.analyser = null;
    this.micData = null;

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }

  private async setupPeerConnection() {
    const token = this.auth.getToken();

    if (token) {
      try {
        const res = await fetch(`${getApiUrl()}/api/webrtc/turn-credentials`, {
          headers: { Authorization: `Bearer ${token}` }
        });
      
        if (res.ok) {
          const data = await res.json();
          if (data?.iceServers?.length) {
            this.config.iceServers = data.iceServers; // lấy TURN/STUN từ Metered
          }
        } else {
          const body = await res.text().catch(() => '');
          console.warn('TURN credentials fetch failed:', res.status, body);
        }
      } catch (e) {
        console.warn('TURN fetch error:', e);
      }
    }
    this.peerConnection = new RTCPeerConnection(this.config);
    this.peerConnection.onconnectionstatechange = () => this.updateNetworkQuality();
    this.peerConnection.oniceconnectionstatechange = () => this.updateNetworkQuality();
    this.videoSender = null;
    this.localStream?.getTracks().forEach((t) => {
      const sender = this.peerConnection!.addTrack(t, this.localStream!);
      if (t.kind === 'video') {
        this.videoSender = sender;
      }
    });

    this.peerConnection.ontrack = (e) => {
      setTimeout(() => {
        const el = this.remoteVideoRef?.nativeElement;
        if (el && e.streams[0]) {
          this.remoteStream = e.streams[0];
          el.srcObject = this.remoteStream;
          this.isPeerCameraOff = false;
          this.startPeerMicVisualizer();
        }
      }, 0);
    };

    this.peerConnection.onicecandidate = (e) => {
      if (e.candidate && this.roomId) {
        this.matching.sendIceCandidate(this.roomId, e.candidate);
      }
    };

    this.subs.push(
      this.matching.onOffer().subscribe(async (data) => {
        if (!this.roomId || !this.peerConnection) return;
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        this.matching.sendAnswer(this.roomId, answer);
      }),
      this.matching.onAnswer().subscribe(async (data) => {
        if (!this.peerConnection) return;
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
      }),
      this.matching.onIceCandidate().subscribe(async (data) => {
        if (!this.peerConnection) return;
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      })
    );

    if (this.roomId && this.isInitiator) {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      this.matching.sendOffer(this.roomId, offer);
    }
    this.sendCurrentCameraState();
  }

  private handlePeerLeft() {
    this.resetPeerState();
    this.matchingStatus = MatchingStatus.SEARCHING;
    this.matching.joinQueue(this.filterForm.value);
  }

  private updateNetworkQuality() {
    const state = this.peerConnection?.iceConnectionState;
    switch (state) {
      case 'connected':
      case 'completed':
        this.networkQualityLabel = 'Mạng tốt';
        break;
      case 'checking':
        this.networkQualityLabel = 'Mạng trung bình';
        break;
      case 'disconnected':
      case 'failed':
        this.networkQualityLabel = 'Mạng yếu';
        break;
      default:
        this.networkQualityLabel = 'Đang kết nối...';
    }
  }

  private resetPeerState() {
    if (this.peerIntroTimeout) {
      clearTimeout(this.peerIntroTimeout);
      this.peerIntroTimeout = null;
    }
    this.showPeerIntro = false;
    this.stopCameraStateSync();
    this.stopPeerMicVisualizer();
    this.peerConnection?.close();
    this.peerConnection = null;
    this.videoSender = null;
    this.remoteStream = null;
    this.peerCameraOffSignaled = null;
    this.isPeerCameraOff = false;
    this.peerDisplayName = '';
    this.peerAvatarUrlValue = '';
    this.chatMessages = [];
    this.chatDraft = '';
    this.unreadChatCount = 0;
    this.showPeerActionMenu = false;
    this.isChatBubbleOpen = false;
    this.networkQualityLabel = 'Đang kết nối...';
    this.roomId = null;
    this.peerUserId = null;
    const rv = this.remoteVideoRef?.nativeElement;
    if (rv) rv.srcObject = null;
  }

  private cleanup() {
    this.resetPeerState();
    this.stopMicVisualizer();
    this.detachLocalVideoTrackListeners();
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    const lv = this.localVideoRef?.nativeElement;
    if (lv) lv.srcObject = null;
  }

  private pushChatMessage(text: string, mine: boolean, sentAt: number) {
    this.chatMessages.push({ text: text.slice(0, 500), mine, sentAt });
    if (this.chatMessages.length > 60) {
      this.chatMessages = this.chatMessages.slice(-60);
    }
    this.queueScrollChatToBottom();
  }

  private queueScrollChatToBottom() {
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      const container =
        (this.isMobileView ? this.mobileChatMessagesRef?.nativeElement : this.desktopChatMessagesRef?.nativeElement)
        || this.mobileChatMessagesRef?.nativeElement
        || this.desktopChatMessagesRef?.nativeElement;
      if (!container) return;
      container.scrollTop = container.scrollHeight;
    });
  }

  private updateViewportState() {
    if (typeof window === 'undefined') return;
    this.isMobileView = window.innerWidth <= 768;
    this.chatBubblePos = this.clampChatBubble(this.chatBubblePos);
    if (!this.isMobileView) {
      this.isChatBubbleOpen = false;
    }
  }

  private clampChatBubble(pos: { x: number; y: number }): { x: number; y: number } {
    if (typeof window === 'undefined') return pos;
    const bubbleSize = 56;
    const minX = 8;
    const minY = 72;
    const maxX = Math.max(minX, window.innerWidth - bubbleSize - 8);
    const maxY = Math.max(minY, window.innerHeight - bubbleSize - 8);
    return {
      x: Math.min(Math.max(minX, pos.x), maxX),
      y: Math.min(Math.max(minY, pos.y), maxY)
    };
  }

  private lockPageScroll() {
    if (typeof document === 'undefined') return;
    this.originalBodyOverflow = document.body.style.overflow;
    this.originalHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  }

  private unlockPageScroll() {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = this.originalBodyOverflow;
    document.documentElement.style.overflow = this.originalHtmlOverflow;
  }

  /**
   * Ensure server receives leave/end signal before leaving Home view,
   * so the peer can be released and rematched immediately.
   */
  private terminateSession(disconnectSocket: boolean) {
    if (this.roomId) {
      this.matching.endCall(this.roomId);
    } else if (this.isSearching) {
      this.matching.leaveQueue();
    }

    if (disconnectSocket) {
      this.matching.disconnect();
    }
  }

  private startCameraStateSync() {
    this.stopCameraStateSync();
    if (typeof window === 'undefined') return;
    this.cameraStateSyncInterval = setInterval(() => {
      this.sendCurrentCameraState();
    }, 2000);
  }

  private stopCameraStateSync() {
    if (this.cameraStateSyncInterval) {
      clearInterval(this.cameraStateSyncInterval);
      this.cameraStateSyncInterval = null;
    }
  }

  private attachLocalVideoTrackListeners() {
    this.detachLocalVideoTrackListeners();
    const track = this.localStream?.getVideoTracks?.()[0] || null;
    if (!track) return;
    this.localVideoTrack = track;
    track.addEventListener('mute', this.onVisibilityOrPageHidden);
    track.addEventListener('unmute', this.onVisibilityOrPageHidden);
    track.addEventListener('ended', this.onVisibilityOrPageHidden);
  }

  private detachLocalVideoTrackListeners() {
    if (!this.localVideoTrack) return;
    this.localVideoTrack.removeEventListener('mute', this.onVisibilityOrPageHidden);
    this.localVideoTrack.removeEventListener('unmute', this.onVisibilityOrPageHidden);
    this.localVideoTrack.removeEventListener('ended', this.onVisibilityOrPageHidden);
    this.localVideoTrack = null;
  }

  private isLocalCameraUnavailable(): boolean {
    if (this.isCameraOff) return true;
    if (
      this.isMobileView &&
      typeof document !== 'undefined' &&
      document.visibilityState !== 'visible'
    ) {
      return true;
    }
    const track = this.localStream?.getVideoTracks?.()[0];
    if (!track) return true;
    return !track.enabled || track.readyState !== 'live' || track.muted;
  }

  private sendCurrentCameraState() {
    if (!this.roomId || !this.isConnected) return;
    this.matching.sendCameraState(this.roomId, this.isLocalCameraUnavailable());
  }

  private showPeerMatchedIntro() {
    if (this.peerIntroTimeout) {
      clearTimeout(this.peerIntroTimeout);
    }
    this.peerIntroName = this.peerDisplayName || 'Đối phương';
    this.showPeerIntro = true;
    this.peerIntroTimeout = setTimeout(() => {
      this.showPeerIntro = false;
      this.peerIntroTimeout = null;
    }, 1600);
  }

  private async replaceVideoSenderTrack(track: MediaStreamTrack | null) {
    if (!this.peerConnection) return;

    const sender =
      this.videoSender ||
      this.peerConnection.getSenders().find((s) => s.track?.kind === 'video') ||
      null;

    if (sender) {
      await sender.replaceTrack(track);
      this.videoSender = sender;
      return;
    }

    if (track && this.localStream) {
      this.videoSender = this.peerConnection.addTrack(track, this.localStream);
    }
  }

  private startPeerMicVisualizer() {
    this.stopPeerMicVisualizer();
    if (!this.remoteStream || typeof window === 'undefined') return;

    const audioTracks = this.remoteStream.getAudioTracks();
    const hasAudio = audioTracks.length > 0;

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    this.peerAudioContext = new AudioCtx();
    this.peerMicData = null;
    if (hasAudio) {
      this.peerAnalyser = this.peerAudioContext.createAnalyser();
      this.peerAnalyser.fftSize = 512;
      this.peerAnalyser.smoothingTimeConstant = 0.65;
      this.peerMicData = new Uint8Array(this.peerAnalyser.frequencyBinCount);
      this.peerMicSource = this.peerAudioContext.createMediaStreamSource(this.remoteStream);
      this.peerMicSource.connect(this.peerAnalyser);
      this.peerAudioContext.resume().catch(() => {});
    }

    const tick = () => {
      const videoTrack = this.remoteStream?.getVideoTracks()?.[0];
      const remoteVideoEl = this.remoteVideoRef?.nativeElement;
      const hasRenderedFrame = !!remoteVideoEl &&
        remoteVideoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        remoteVideoEl.videoWidth > 0 &&
        remoteVideoEl.videoHeight > 0;
      const trackLooksOff = !videoTrack ||
        videoTrack.readyState !== 'live' ||
        videoTrack.muted ||
        !videoTrack.enabled;
      const inferred = trackLooksOff || !hasRenderedFrame;
      this.isPeerCameraOff = this.peerCameraOffSignaled ?? inferred;

      if (hasAudio && this.peerAnalyser && this.peerMicData) {
        this.peerAnalyser.getByteFrequencyData(this.peerMicData as any);
        let sum = 0;
        let count = 0;
        for (let i = 2; i < Math.min(this.peerMicData.length, 48); i += 1) {
          sum += this.peerMicData[i];
          count += 1;
        }
        const avg = count ? sum / count : 0;
        const level = Math.min(1, avg / 42);
        const pattern = [0.55, 0.75, 1, 0.75, 0.55];
        const base = 0.12;
        this.peerMicBars = pattern.map((weight) => Math.min(1, base + level * weight));
      } else {
        this.peerMicBars = [0.12, 0.12, 0.12, 0.12, 0.12];
      }

      this.peerMicAnimFrame = window.requestAnimationFrame(tick);
    };

    tick();
  }

  private stopPeerMicVisualizer() {
    if (typeof window !== 'undefined' && this.peerMicAnimFrame != null) {
      window.cancelAnimationFrame(this.peerMicAnimFrame);
    }
    this.peerMicAnimFrame = null;
    this.peerMicBars = [0.12, 0.12, 0.12, 0.12, 0.12];

    this.peerMicSource?.disconnect();
    this.peerAnalyser?.disconnect();
    this.peerMicSource = null;
    this.peerAnalyser = null;
    this.peerMicData = null;

    if (this.peerAudioContext) {
      this.peerAudioContext.close().catch(() => {});
      this.peerAudioContext = null;
    }
  }

  
}
