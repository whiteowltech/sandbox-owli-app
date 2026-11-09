import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  type ElementRef,
  input,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { prefersReducedMotion } from '../motion/motion';

/** Estados de ánimo de Owli: los mismos que OwliMood en el dominio del backend. */
export type OwliMood = 'energetic' | 'neutral' | 'tired' | 'satisfied';

/** Salto corto: sube, se estira y cae con un pequeño aplastón. */
const HOP: Keyframe[] = [
  { transform: 'translateY(0) scale(1, 1)' },
  { transform: 'translateY(0) scale(1.06, 0.94)', offset: 0.15 },
  { transform: 'translateY(-16%) scale(0.96, 1.05)', offset: 0.45 },
  { transform: 'translateY(0) scale(1.05, 0.95)', offset: 0.8 },
  { transform: 'translateY(0) scale(1, 1)' },
];

/**
 * Owli ilustrado. Por ahora es una imagen por estado de ánimo: al cambiar de ánimo
 * una se funde en la otra, y `hop` lo hace saltar (sube el número para que salte).
 * Cuando exista la versión animada (Rive, ver pendientes.md) se reemplaza aquí sin
 * tocar las pantallas.
 */
@Component({
  selector: 'owli-owl',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.width.px]': 'size()', '[style.height.px]': 'size()' },
  template: `
    <span #body class="body">
      @for (m of moods(); track m.key) {
        <img
          animate.enter="owl-in"
          animate.leave="owl-out"
          [src]="'assets/owli/owli-' + m.key + '.png'"
          [width]="size()"
          [height]="size()"
          [attr.alt]="decorative() ? '' : ('owli.mood.' + m.key | transloco)"
          [attr.aria-hidden]="decorative() || null"
          draggable="false"
        />
      }
    </span>
  `,
  styles: `
    :host {
      display: inline-block;
      line-height: 0;
    }
    .body {
      position: relative;
      display: block;
      width: 100%;
      height: 100%;
      transform-origin: 50% 100%;
    }
    img {
      position: absolute;
      inset: 0;
      object-fit: contain;
      user-select: none;
    }
    .owl-in {
      animation: owl-in var(--owli-dur) var(--owli-ease);
    }
    .owl-out {
      animation: owl-in var(--owli-dur) var(--owli-ease) reverse forwards;
    }
    @keyframes owl-in {
      from {
        opacity: 0;
      }
    }
  `,
})
export class OwlComponent {
  readonly mood = input<OwliMood>('neutral');
  readonly size = input(96);
  /** true cuando el texto al lado ya dice lo mismo: el lector de pantalla lo omite. */
  readonly decorative = input(false);
  /** Cada vez que cambia (y no es 0), Owli salta: al guardar una comida, al cerrar el día. */
  readonly hop = input(0);

  /** Una sola imagen; al cambiar el ánimo se reemplaza (y se funde) gracias al `track`. */
  protected readonly moods = computed(() => [{ key: this.mood() }]);
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');

  constructor() {
    effect(() => {
      if (this.hop() === 0 || prefersReducedMotion()) return;
      untracked(() => this.body().nativeElement.animate?.(HOP, { duration: 480, easing: 'ease-out' }));
    });
  }
}
