import { InjectionToken } from '@angular/core';

/** Sesión con la API (ver CLAUDE.md, Autenticación). Las fechas, en ms desde epoch. */
export interface Session {
  userId: string;
  accessToken: string;
  accessExpiresAt: number;
  refreshToken: string;
  refreshExpiresAt: number;
}

/**
 * Dónde se guarda la sesión. Hoy localStorage; en la app nativa irá al
 * almacenamiento seguro del sistema (Keychain / Keystore). Ver pendientes.md.
 */
export interface SessionStorage {
  load(): Session | null;
  save(s: Session): void;
  clear(): void;
}

const KEY = 'owli:session:v1';

export const SESSION_STORAGE = new InjectionToken<SessionStorage>('SESSION_STORAGE', {
  providedIn: 'root',
  factory: () => ({
    load: () => {
      try {
        const raw = localStorage.getItem(KEY);
        return raw ? (JSON.parse(raw) as Session) : null;
      } catch {
        return null;
      }
    },
    save: (s) => {
      try {
        localStorage.setItem(KEY, JSON.stringify(s));
      } catch {
        /* sin persistencia: la sesión vive en memoria */
      }
    },
    clear: () => {
      try {
        localStorage.removeItem(KEY);
      } catch {
        /* nada que borrar */
      }
    },
  }),
});
