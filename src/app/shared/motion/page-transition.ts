import { createAnimation, type Animation, type AnimationBuilder } from '@ionic/angular';

/** Cuánto se desplaza la pantalla que entra (px): un indicio de dirección, no un deslizamiento entero. */
const SHIFT = 28;
const DURATION = 320;
/** La misma curva que --owli-ease (theme/variables.scss). */
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

interface TransitionOpts {
  enteringEl: HTMLElement;
  leavingEl?: HTMLElement;
  direction?: 'forward' | 'back' | string;
}

/**
 * Transición entre pantallas de Owli: la nueva entra con un desplazamiento corto y
 * aparece; la anterior se corre un poco y se apaga. Más calma que el deslizamiento
 * entero de iOS y propia de la app. Al volver, al revés. Es una animación de Ionic
 * (no de Angular), así que el gesto de deslizar para volver en iOS la sigue con el dedo.
 * Con "reducir movimiento", Ionic ya pone la duración en 0.
 */
export const owliPageTransition: AnimationBuilder = (_base: Element, opts: TransitionOpts): Animation => {
  const back = opts.direction === 'back';
  const sign = back ? -1 : 1;

  const entering = createAnimation()
    .addElement(opts.enteringEl)
    .beforeRemoveClass('ion-page-invisible')
    .fromTo('transform', `translateX(${sign * SHIFT}px)`, 'translateX(0)')
    .fromTo('opacity', 0, 1);

  const root = createAnimation().duration(DURATION).easing(EASE).addAnimation(entering);

  if (opts.leavingEl) {
    root.addAnimation(
      createAnimation()
        .addElement(opts.leavingEl)
        .fromTo('transform', 'translateX(0)', `translateX(${sign * -SHIFT * 0.4}px)`)
        .fromTo('opacity', 1, 0),
    );
  }
  return root;
};
