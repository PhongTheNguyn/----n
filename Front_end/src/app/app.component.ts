import { Component } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { SessionEnforcementService } from './services/session-enforcement.service';

@Component({
  selector: 'app-root',
  template: '<router-outlet></router-outlet>',
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
  `]
})
export class AppComponent {
  title = 'Video Call Random App';

  constructor(
    private router: Router,
    private sessionEnforcement: SessionEnforcementService
  ) {
    this.sessionEnforcement.ensureConnection();
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this.sessionEnforcement.ensureConnection();
      });
  }
}
