import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ProfileService } from '../../services/profile.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
  profileForm: FormGroup;
  isLoading = false;
  avatarPreview: string | ArrayBuffer | null = null;
  selectedFile: File | null = null;

  genders = [
    { value: 'male', label: 'Nam' },
    { value: 'female', label: 'Nữ' },
    { value: 'other', label: 'Khác' }
  ];

  countries = [
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
    private profileService: ProfileService,
    private auth: AuthService,
    private snackBar: MatSnackBar
  ) {
    this.profileForm = this.fb.group({
      displayName: ['', [Validators.required, Validators.minLength(2)]],
      gender: ['male', Validators.required],
      country: ['vn', Validators.required],
      age: [25, [Validators.required, Validators.min(18), Validators.max(100)]],
      bio: ['', [Validators.maxLength(200)]]
    });
    this.avatarPreview = 'assets/default-avatar.svg';
  }

  ngOnInit() {
    this.profileService.getProfile().subscribe({
      next: (user) => {
        this.profileForm.patchValue({
          displayName: user.displayName,
          gender: user.gender,
          country: user.country,
          age: user.age,
          bio: user.bio || ''
        });
        if (user.avatarUrl) {
          this.avatarPreview = user.avatarUrl;
        }
      },
      error: () => {
        this.snackBar.open('Không thể tải hồ sơ', 'Đóng', { duration: 3000 });
      }
    });
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.selectedFile = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        this.avatarPreview = e.target?.result || null;
      };
      reader.readAsDataURL(this.selectedFile);
    }
  }

  triggerFileInput() {
    const fileInput = document.getElementById('avatar-input') as HTMLInputElement;
    fileInput?.click();
  }

  onSubmit() {
    if (this.profileForm.invalid) return;
    this.isLoading = true;

    const doUpdate = (avatarUrl?: string) => {
      const data = {
        displayName: this.profileForm.value.displayName,
        gender: this.profileForm.value.gender,
        country: this.profileForm.value.country,
        age: this.profileForm.value.age,
        bio: this.profileForm.value.bio
      };
      this.profileService.updateProfile(data).subscribe({
        next: (user) => {
          if (avatarUrl) {
            this.auth.updateStoredUser({ avatarUrl });
          }
          this.isLoading = false;
          this.snackBar.open('Đã lưu thay đổi thành công!', 'Đóng', { duration: 3000 });
          this.router.navigate(['/home']);
        },
        error: () => {
          this.isLoading = false;
          this.snackBar.open('Lưu thay đổi thất bại', 'Đóng', { duration: 3000 });
        }
      });
    };

    if (this.selectedFile) {
      this.profileService.uploadAvatar(this.selectedFile).subscribe({
        next: (res) => {
          this.avatarPreview = res.avatarUrl;
          this.selectedFile = null;
          doUpdate(res.avatarUrl);
        },
        error: () => {
          this.isLoading = false;
          this.snackBar.open('Tải ảnh lên thất bại', 'Đóng', { duration: 3000 });
        }
      });
    } else {
      doUpdate();
    }
  }

  onImageError(event: Event) {
    const img = event.target as HTMLImageElement | null;
    if (img) {
      img.src = 'assets/default-avatar.svg';
    }
  }

  goToHome() {
    this.router.navigate(['/home']);
  }
}
