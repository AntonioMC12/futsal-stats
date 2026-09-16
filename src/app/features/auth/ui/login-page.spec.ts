import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { CLOUD_CONFIG } from '../../../core/cloud/cloud.config';
import { CloudFoundationService } from '../../../core/cloud/cloud-foundation.service';
import { OfflineSyncService } from '../../../core/sync/offline-sync.service';
import { TeamWorkspaceContext } from '../../../core/team-workspace/team-workspace.context';
import { LoginPage } from './login-page';

describe('LoginPage', () => {
  const requestEmailOtp = vi.fn().mockResolvedValue(undefined);
  const verifyEmailOtp = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    requestEmailOtp.mockClear();
    verifyEmailOtp.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: CLOUD_CONFIG, useValue: { mode: 'cloud' } },
        { provide: AuthService, useValue: {
          initialize: async () => {}, authenticated: signal(false),
          requestEmailOtp, verifyEmailOtp,
        } },
        { provide: CloudFoundationService, useValue: { status: signal('connected'), initialize: async () => {} } },
        { provide: OfflineSyncService, useValue: { initialize: async () => {} } },
        { provide: TeamWorkspaceContext, useValue: { refresh: async () => {} } },
      ],
    });
  });

  it('requests a code, offers resend, and returns to email entry', async () => {
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    const email = fixture.nativeElement.querySelector('input[type=email]') as HTMLInputElement;
    email.value = ' Coach@Example.com ';
    email.dispatchEvent(new Event('input'));
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(requestEmailOtp).toHaveBeenCalledWith('Coach@Example.com');
    expect(fixture.nativeElement.textContent).toContain('Verifica tu correo');
    expect(fixture.nativeElement.textContent).toContain('Reenviar código en');
    const changeButton = [...fixture.nativeElement.querySelectorAll('button')]
      .find((button: HTMLButtonElement) => button.textContent?.includes('Cambiar correo')) as HTMLButtonElement;
    changeButton.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[type=email]')).toBeTruthy();
  });
});
