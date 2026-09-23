import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type ProfileStatusTone = 'neutral' | 'positive' | 'negative' | 'no-data';

@Component({
  selector: 'app-profile-status-badge',
  template: `<span [class]="'status-badge status-badge--' + tone()">{{ label() }}</span>`,
  styles: `
    :host {
      display: inline-flex;
    }
    .status-badge {
      min-height: 1.7rem;
      padding: 0.22rem 0.62rem;
      border: 1px solid var(--ds-border);
      border-radius: var(--ds-radius-pill);
      background: var(--ds-surface-raised);
      color: var(--ds-text-secondary);
      display: inline-flex;
      align-items: center;
      font-size: 0.72rem;
      font-weight: 800;
      line-height: 1;
      white-space: nowrap;
    }
    .status-badge--positive {
      border-color: color-mix(in srgb, var(--ds-success) 35%, transparent);
      background: var(--ds-success-soft);
      color: var(--ds-success-strong);
    }
    .status-badge--negative {
      border-color: color-mix(in srgb, var(--ds-danger) 35%, transparent);
      background: var(--ds-danger-soft);
      color: var(--ds-danger-strong);
    }
    .status-badge--no-data {
      color: var(--ds-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileStatusBadgeComponent {
  readonly label = input.required<string>();
  readonly tone = input<ProfileStatusTone>('neutral');
}
