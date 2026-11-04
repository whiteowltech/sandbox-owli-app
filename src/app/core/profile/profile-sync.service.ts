import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_URL } from '../api/api-url';
import { AuthService, SessionLostError } from '../auth/auth.service';

import { ProfileStore } from './profile.store';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'pending';

const PENDING_KEY = 'owli:profile-sync:pending';

function readPending(): boolean {
  try {
    return localStorage.getItem(PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

function writePending(pending: boolean): void {
  try {
    if (pending) localStorage.setItem(PENDING_KEY, '1');
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* sin persistencia: se reintenta en la próxima sincronización */
  }
}

/**
 * Sube el perfil al servidor. El perfil vive primero en el teléfono: si no hay
 * conexión, el usuario sigue usando la app y la subida queda pendiente para la
 * próxima vez que se abra.
 */
@Injectable({ providedIn: 'root' })
export class ProfileSyncService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);
  private readonly auth = inject(AuthService);
  private readonly profiles = inject(ProfileStore);

  private readonly state = signal<SyncStatus>(readPending() ? 'pending' : 'idle');
  readonly status = this.state.asReadonly();

  private running: Promise<boolean> | null = null;

  /** Sube el perfil actual. Devuelve true si quedó guardado en el servidor. */
  sync(): Promise<boolean> {
    this.running ??= this.run().finally(() => (this.running = null));
    return this.running;
  }

  /** Al abrir la app: reintenta solo si quedó algo sin subir. */
  retryIfPending(): Promise<boolean> {
    return readPending() ? this.sync() : Promise.resolve(false);
  }

  /** Olvida lo pendiente (p. ej. al borrar el perfil). */
  reset(): void {
    writePending(false);
    this.state.set('idle');
  }

  private async run(): Promise<boolean> {
    if (!this.profiles.profile()) return false;
    writePending(true);
    this.state.set('syncing');
    try {
      await this.upload();
    } catch (err) {
      if (!(err instanceof SessionLostError)) return this.fail();
      // La sesión anterior ya no sirve: se abre una nueva y se vuelve a subir.
      try {
        await this.upload();
      } catch {
        return this.fail();
      }
    }
    writePending(false);
    this.state.set('synced');
    return true;
  }

  private async upload(): Promise<void> {
    await this.auth.ensureSession();
    const profile = this.profiles.profile();
    if (!profile) return;
    // La zona horaria define dónde corta el "día" del usuario para los totales.
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    await firstValueFrom(this.http.put(`${this.apiUrl}/v1/me/profile`, { ...profile, timezone }));
  }

  private fail(): boolean {
    this.state.set('pending');
    return false;
  }
}
