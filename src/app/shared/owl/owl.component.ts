import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/** Estados de ánimo de Owli: los mismos que OwliMood en el dominio del backend. */
export type OwliMood = 'energetic' | 'neutral' | 'tired' | 'satisfied';

/**
 * Owli ilustrado. Por ahora es una imagen por estado de ánimo; cuando exista la
 * versión animada (Rive, ver pendientes.md) se reemplaza aquí sin tocar las pantallas.
 */
@Component({
  selector: 'owli-owl',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <img
      [src]="src()"
      [width]="size()"
      [height]="size()"
      [attr.alt]="decorative() ? '' : ('owli.mood.' + mood() | transloco)"
      [attr.aria-hidden]="decorative() || null"
      draggable="false"
    />
  `,
  styles: `
    :host {
      display: inline-block;
      line-height: 0;
    }
    img {
      object-fit: contain;
      user-select: none;
    }
  `,
})
export class OwlComponent {
  readonly mood = input<OwliMood>('neutral');
  readonly size = input(96);
  /** true cuando el texto al lado ya dice lo mismo: el lector de pantalla lo omite. */
  readonly decorative = input(false);

  protected readonly src = computed(() => `assets/owli/owli-${this.mood()}.png`);
}
