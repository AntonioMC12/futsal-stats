import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type ProfileMetricTone = 'neutral' | 'positive' | 'negative' | 'no-data';

@Component({
  selector: 'app-profile-metric',
  template: `
    <article
      class="profile-metric"
      [class.profile-metric--compact]="compact()"
      [class.profile-metric--positive]="tone() === 'positive'"
      [class.profile-metric--negative]="tone() === 'negative'"
      [class.profile-metric--no-data]="tone() === 'no-data'"
      [class.metric-card--goalkeeper]="goalkeeper()"
    >
      <span>{{ label() }}</span>
      <strong>{{ value() }}</strong>
      @if (detail()) {
        <small>{{ detail() }}</small>
      }
    </article>
  `,
  styleUrl: './profile-metric.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileMetricComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly detail = input('');
  readonly compact = input(false);
  readonly tone = input<ProfileMetricTone>('neutral');
  readonly goalkeeper = input(false);
}
