import { Directive, ElementRef, inject, output } from '@angular/core';

/** Cuánto hay que bajar la hoja (px) o qué tan rápido (px/ms) para que se cierre al soltarla. */
const DISMISS_DISTANCE = 96;
const DISMISS_VELOCITY = 0.6;

/**
 * Hoja inferior que se cierra arrastrándola hacia abajo, como en iOS. Se arrastra
 * desde la manija o el encabezado de la hoja (no desde la lista, que se desplaza).
 * Al soltar lejos o rápido emite `dismissed`; la animación de salida la pone la
 * pantalla (`animate.leave`) y parte desde donde quedó el dedo.
 */
@Directive({
  selector: '[owliSheetDrag]',
  host: {
    '(pointerdown)': 'onDown($event)',
    '(pointermove)': 'onMove($event)',
    '(pointerup)': 'onUp($event)',
    '(pointercancel)': 'reset()',
  },
})
export class SheetDragDirective {
  readonly dismissed = output<void>();

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private pointer: number | null = null;
  private startY = 0;
  private startT = 0;
  private dy = 0;

  constructor() {
    // La manija visible (estilos en theme/ui.scss); es decorativa: el gesto no es la única forma de cerrar.
    const grab = document.createElement('div');
    grab.className = 'grab';
    grab.setAttribute('aria-hidden', 'true');
    this.el.prepend(grab);
  }

  protected onDown(e: PointerEvent): void {
    if (e.button !== 0 || !(e.target instanceof Element)) return;
    if (!e.target.closest('.grab, header') || e.target.closest('button, a, input, select, textarea')) return;
    this.pointer = e.pointerId;
    this.startY = e.clientY;
    this.startT = e.timeStamp;
    this.dy = 0;
    this.el.setPointerCapture(e.pointerId);
    this.el.style.transition = 'none';
  }

  protected onMove(e: PointerEvent): void {
    if (e.pointerId !== this.pointer) return;
    this.dy = Math.max(0, e.clientY - this.startY);
    this.el.style.transform = `translateY(${this.dy}px)`;
  }

  protected onUp(e: PointerEvent): void {
    if (e.pointerId !== this.pointer) return;
    const velocity = this.dy / Math.max(1, e.timeStamp - this.startT);
    this.pointer = null;
    if (this.dy > DISMISS_DISTANCE || (this.dy > 24 && velocity > DISMISS_VELOCITY)) {
      this.el.style.transition = '';
      this.dismissed.emit();
      return;
    }
    this.reset();
  }

  /** Vuelve a su lugar (soltó cerca, o el sistema canceló el gesto). */
  protected reset(): void {
    this.pointer = null;
    this.el.style.transition = 'transform var(--owli-dur) var(--owli-ease)';
    this.el.style.transform = '';
  }
}
