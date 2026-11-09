import { DestroyRef, effect, inject, signal, untracked, type Signal } from '@angular/core';

/** true si el sistema pide menos movimiento: las animaciones saltan directo al final. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Un número que llega a su valor contando (p. ej. las calorías que quedan), en vez de
 * cambiar de golpe. Rápido y con frenado al final; sin animación si se pide menos
 * movimiento. Se crea en un contexto de inyección (constructor o campo de un componente).
 *
 * @param from valor inicial; por defecto, el actual de `source` (la primera vez no anima).
 */
export function tweened(source: () => number, ms = 600, from?: number): Signal<number> {
  const out = signal(from ?? untracked(source));
  let frame = 0;

  effect(() => {
    const to = source();
    cancelAnimationFrame(frame);
    const start = untracked(out);
    if (start === to || prefersReducedMotion()) {
      out.set(to);
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      out.set(k === 1 ? to : start + (to - start) * eased);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  });

  inject(DestroyRef).onDestroy(() => cancelAnimationFrame(frame));
  return out.asReadonly();
}
