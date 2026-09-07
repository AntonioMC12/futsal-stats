import { Component, input, output } from '@angular/core';
import { TacticalTool } from '../../domain/strategy';
@Component({
  selector: 'app-tactical-toolbar',
  templateUrl: './tactical-toolbar.html',
  styleUrl: './tactical-toolbar.scss',
})
export class TacticalToolbar {
  readonly tool = input.required<TacticalTool>();
  readonly disabled = input(false);
  readonly canDelete = input(false);
  readonly vertical = input(false);
  readonly toolSelected = output<TacticalTool>();
  readonly deleteRequested = output<void>();
}
