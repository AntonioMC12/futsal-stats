import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { CLOUD_CONFIG } from '../../../core/cloud/cloud.config';
import { CloudFoundationService } from '../../../core/cloud/cloud-foundation.service';
import { OfflineSyncService } from '../../../core/sync/offline-sync.service';
import { TeamWorkspaceContext } from '../../../core/team-workspace/team-workspace.context';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage {
  protected readonly auth = inject(AuthService);
  protected readonly config = inject(CLOUD_CONFIG);
  private readonly cloud = inject(CloudFoundationService);
  private readonly sync = inject(OfflineSyncService);
  private readonly workspace = inject(TeamWorkspaceContext);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly codeRequested = signal(false);

  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    code: ['', [Validators.pattern(/^\d{6}$/)]],
  });

  constructor() {
    void this.restoreAndContinue();
  }

  protected async requestAccess(): Promise<void> {
    this.form.controls.email.markAsTouched();
    if (this.form.controls.email.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.requestAccess(
        this.form.controls.email.value,
        this.route.snapshot.queryParamMap.get('redirect'),
      );
      this.codeRequested.set(true);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async verifyCode(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.controls.email.invalid || this.form.controls.code.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.verifyAccessCode(
        this.form.controls.email.value,
        this.form.controls.code.value,
      );
      await this.continueToApplication();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private async restoreAndContinue(): Promise<void> {
    await this.auth.initialize();
    if (this.auth.authenticated() && this.config.mode === 'cloud') {
      await this.continueToApplication();
    }
  }

  private async continueToApplication(): Promise<void> {
    await this.cloud.initialize();
    if (this.cloud.status() !== 'connected') {
      throw new Error('No se ha podido conectar con el espacio cloud.');
    }
    await this.sync.initialize();
    await this.workspace.refresh();
    const redirect = this.route.snapshot.queryParamMap.get('redirect');
    await this.router.navigateByUrl(safeRedirect(redirect));
  }
}

function safeRedirect(value: string | null): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/dashboard';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No se ha podido iniciar sesión.';
}
