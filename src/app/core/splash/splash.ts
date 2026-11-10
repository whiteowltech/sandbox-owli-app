import { prefersReducedMotion } from '../../shared/motion/motion';

/** Lo que dura la secuencia de entrada de index.html (luna, Owli que aterriza, nombre). */
const SEQUENCE_MS = 1100;
/** Cuánto dura la salida: el fundido (#owli-splash.out en index.html) o el vuelo de Owli. */
const OUT_MS = 320;
const FLIGHT_MS = 520;
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'; // --owli-ease

/**
 * Quita la presentación de index.html. Espera a que termine la secuencia (contada
 * desde que se abrió la página, así que si la app tardó en cargar no se suma espera).
 * Si la pantalla de abajo tiene a Owli, el de la presentación vuela hasta su lugar
 * mientras el fondo se apaga, y parece el mismo búho que se acomoda; si no, se funde.
 * Un toque la saltea. Con "reducir movimiento" no espera ni vuela.
 * Se llama una vez, cuando la primera pantalla ya está dibujada.
 */
export function dismissSplash(doc: Document = document): void {
  const el = doc.getElementById('owli-splash');
  if (!el) return;

  let gone = false;
  const leave = () => {
    if (gone) return;
    gone = true;
    const flew = !prefersReducedMotion() && flyToOwl(el, doc);
    if (!flew) el.classList.add('out');
    setTimeout(() => el.remove(), prefersReducedMotion() ? 0 : flew ? FLIGHT_MS : OUT_MS);
  };

  el.addEventListener('pointerdown', leave, { once: true });
  const wait = prefersReducedMotion() ? 0 : Math.max(0, SEQUENCE_MS - performance.now());
  setTimeout(leave, wait);
}

/** Lleva al Owli de la presentación hasta el Owli visible de la pantalla. false si no hay a dónde. */
function flyToOwl(el: HTMLElement, doc: Document): boolean {
  const from = el.querySelector('img');
  const to = [...doc.querySelectorAll<HTMLElement>('owli-owl')].find((o) => o.getBoundingClientRect().height > 40);
  if (!from || !to || typeof from.animate !== 'function') return false;

  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  // Las imágenes de Owli son verticales: ocupan todo el alto de su caja y se apoyan abajo.
  const scale = b.height / a.height;
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.bottom - a.bottom;

  el.style.pointerEvents = 'none';
  // Owli de la pantalla queda oculto hasta que llega el que vuela; al quitar la
  // presentación ocupan el mismo lugar y el cambio no se nota (no se ven dos).
  to.animate([{ opacity: 0 }, { opacity: 0, offset: 0.97 }, { opacity: 1 }], { duration: FLIGHT_MS });
  from.animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${scale})` }], {
    duration: FLIGHT_MS,
    easing: EASE,
    fill: 'forwards',
  });
  el.animate([{ backgroundColor: '#1b2a26' }, { backgroundColor: 'rgba(27, 42, 38, 0)' }], {
    duration: FLIGHT_MS * 0.8,
    easing: EASE,
    fill: 'forwards',
  });
  el.querySelectorAll<HTMLElement>('.moon, .name').forEach((n) =>
    n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }),
  );
  return true;
}
