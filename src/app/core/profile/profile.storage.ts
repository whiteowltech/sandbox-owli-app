import { Injectable, InjectionToken } from '@angular/core';

import type { Profile } from './profile.model';

/**
 * Dónde se guarda el perfil en el dispositivo. Es un puerto: hoy localStorage,
 * más adelante Capacitor Preferences y la sincronización con el backend.
 */
export interface ProfileStorage {
  load(): Profile | null;
  save(profile: Profile): void;
  clear(): void;
}

export const PROFILE_STORAGE = new InjectionToken<ProfileStorage>('PROFILE_STORAGE', {
  providedIn: 'root',
  factory: () => new LocalProfileStorage(),
});

const KEY = 'owli:profile:v1';

@Injectable()
export class LocalProfileStorage implements ProfileStorage {
  // localStorage puede no estar disponible (modo privado, almacenamiento lleno):
  // en ese caso la app sigue funcionando y el perfil vive solo en memoria.
  load(): Profile | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Profile) : null;
    } catch {
      return null;
    }
  }

  save(profile: Profile): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(profile));
    } catch {
      /* sin persistencia: el perfil queda en memoria */
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* nada que borrar */
    }
  }
}
