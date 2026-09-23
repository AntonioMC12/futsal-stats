import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-season-selector',
  template: `
    <label>
      <span>Temporada</span>
      <select [value]="value()" (change)="changed($event)" aria-label="Seleccionar temporada">
        <option value="all">Toda la carrera</option>
        @for (season of seasons(); track season) {
          <option [value]="season">{{ season }}</option>
        }
      </select>
    </label>
  `,
  styles: `
    :host {
      display: block;
    }
    label {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      color: var(--ds-text-muted);
      font-size: 0.72rem;
      font-weight: 800;
    }
    select {
      min-height: var(--ds-touch-min);
      padding: 0 2rem 0 0.75rem;
      border: 1px solid var(--ds-border);
      border-radius: var(--ds-radius-button);
      background: var(--ds-surface-secondary);
      color: var(--ds-text);
      font: inherit;
      cursor: pointer;
    }
    select:hover {
      border-color: var(--ds-border-strong);
    }
    @media (max-width: 540px) {
      label {
        align-items: stretch;
        flex-direction: column;
        gap: 0.25rem;
      }
      select {
        width: 100%;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeasonSelectorComponent {
  readonly value = input.required<string>();
  readonly seasons = input.required<readonly string[]>();
  readonly valueChange = output<string>();

  protected changed(event: Event): void {
    this.valueChange.emit((event.target as HTMLSelectElement).value);
  }
}
