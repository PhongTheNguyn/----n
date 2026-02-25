import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface ReportDialogData {
  reportedDisplayName?: string;
}

@Component({
  selector: 'app-report-dialog',
  templateUrl: './report-dialog.component.html',
  styleUrls: ['./report-dialog.component.scss']
})
export class ReportDialogComponent {
  form: FormGroup;
  reasons = [
    { value: 'inappropriate', label: 'Nội dung không phù hợp' },
    { value: 'harassment', label: 'Quấy rối' },
    { value: 'spam', label: 'Spam' },
    { value: 'other', label: 'Khác' }
  ];

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<ReportDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ReportDialogData
  ) {
    this.form = this.fb.group({
      reason: ['inappropriate', Validators.required],
      description: ['']
    });
  }

  cancel(): void {
    this.dialogRef.close(null);
  }

  submit(): void {
    if (this.form.valid) {
      this.dialogRef.close(this.form.value);
    }
  }
}
