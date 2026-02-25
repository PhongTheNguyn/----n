import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatchingService } from '../../services/matching.service';
import { ReportBlockService } from '../../services/report-block.service';
import { ReportDialogComponent } from '../../components/report-dialog/report-dialog.component';

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
  private subs: Subscription[] = [];
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
    private matching: MatchingService,
    private reportBlock: ReportBlockService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {
    this.filterForm = this.fb.group({
      gender: ['all'],
      country: ['all']
    });
  }

  ngOnInit() {
    this.subs.push(
      this.matching.onMatched().subscribe(({ roomId, peerUserId, isInitiator }) => {
        this.roomId = roomId;
        this.peerUserId = peerUserId || null;
        this.isInitiator = isInitiator;
        this.matchingStatus = MatchingStatus.CONNECTED;
        this.setupPeerConnection();
      }),
      this.matching.onSearching().subscribe(() => {
        this.matchingStatus = MatchingStatus.SEARCHING;
      }),
      this.matching.onPeerSkipped().subscribe(() => this.handlePeerLeft()),
      this.matching.onPeerEnded().subscribe(() => this.handlePeerLeft()),
      this.matching.onPeerDisconnected().subscribe(() => this.handlePeerLeft())
    );
  }

  ngOnDestroy() {
    this.cleanup();
    this.subs.forEach((s) => s.unsubscribe());
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
      this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      this.attachLocalStream();
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

  toggleCamera() {
    this.isCameraOff = !this.isCameraOff;
    this.localStream?.getVideoTracks().forEach((t) => (t.enabled = !this.isCameraOff));
  }

  goToProfile() {
    this.router.navigate(['/profile']);
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

  private attachLocalStream() {
    setTimeout(() => {
      const el = this.localVideoRef?.nativeElement;
      if (el && this.localStream) el.srcObject = this.localStream;
    }, 0);
  }

  private async setupPeerConnection() {
    this.peerConnection = new RTCPeerConnection(this.config);
    this.localStream?.getTracks().forEach((t) => this.peerConnection!.addTrack(t, this.localStream!));

    this.peerConnection.ontrack = (e) => {
      setTimeout(() => {
        const el = this.remoteVideoRef?.nativeElement;
        if (el && e.streams[0]) el.srcObject = e.streams[0];
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
  }

  private handlePeerLeft() {
    this.resetPeerState();
    this.matchingStatus = MatchingStatus.SEARCHING;
    this.matching.joinQueue(this.filterForm.value);
  }

  private resetPeerState() {
    this.peerConnection?.close();
    this.peerConnection = null;
    this.roomId = null;
    this.peerUserId = null;
    const rv = this.remoteVideoRef?.nativeElement;
    if (rv) rv.srcObject = null;
  }

  private cleanup() {
    this.resetPeerState();
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    const lv = this.localVideoRef?.nativeElement;
    if (lv) lv.srcObject = null;
  }
}
