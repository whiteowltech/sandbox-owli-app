import { Injectable } from '@angular/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/**
 * Vibración breve para confirmar acciones. En el navegador usa `navigator.vibrate` si
 * existe; si el dispositivo no vibra, no pasa nada. Nunca debe romper la acción.
 */
@Injectable({ providedIn: 'root' })
export class HapticsService {
  /** Toque suave: algo se guardó. */
  tap(): void {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
  }

  /** Logro: el día quedó cerrado. */
  success(): void {
    Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
  }
}
