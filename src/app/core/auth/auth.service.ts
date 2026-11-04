import { HttpBackend, HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_URL } from '../api/api-url';

import { SESSION_STORAGE, type Session } from './session.storage';

/** El servidor rechazó la sesión (vencida, revocada o reusada): hay que abrir otra. */
export class SessionLostError extends Error {
  constructor() {
    super('La sesión ya no es válida');
    this.name = 'SessionLostError';
  }
}

interface SessionResponse {
  userId: string;
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
}

/** Margen para renovar antes de que venza el access token (evita 401 en vuelo). */
const REFRESH_MARGIN_MS = 30_000;

/**
 * Sesión con la API: cuenta anónima, renovación y cierre.
 *
 * Regla importante: nunca hay dos renovaciones a la vez. El servidor rota el
 * refresh token en cada uso y trata el reuso como robo (cierra la sesión), así
 * que los pedidos simultáneos comparten la misma renovación en curso.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  // HttpBackend saltea los interceptores: estos pedidos no llevan access token.
  private readonly http = new HttpClient(inject(HttpBackend));
  private readonly apiUrl = inject(API_URL);
  private readonly storage = inject(SESSION_STORAGE);

  private readonly current = signal<Session | null>(this.storage.load());
  readonly session = this.current.asReadonly();

  private creating: Promise<Session> | null = null;
  private refreshing: Promise<Session> | null = null;

  /** Garantiza una sesión: si no hay, crea una cuenta anónima (una sola vez). */
  async ensureSession(): Promise<Session> {
    const s = this.current();
    if (s) return s;
    this.creating ??= this.post('/v1/auth/anonymous', {}).finally(() => (this.creating = null));
    return this.creating;
  }

  /** Access token vigente, renovándolo si está por vencer. null si no hay sesión. */
  async accessToken(now = Date.now()): Promise<string | null> {
    const s = this.current();
    if (!s) return null;
    if (s.accessExpiresAt - now > REFRESH_MARGIN_MS) return s.accessToken;
    return (await this.refresh()).accessToken;
  }

  /** Renueva la sesión. Lanza SessionLostError si el servidor la rechaza. */
  async refresh(): Promise<Session> {
    const s = this.current();
    if (!s) throw new SessionLostError();
    this.refreshing ??= this.post('/v1/auth/refresh', { refreshToken: s.refreshToken })
      .catch((err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 401) {
          this.clear();
          throw new SessionLostError();
        }
        throw err; // sin conexión o servidor caído: se conserva la sesión para reintentar
      })
      .finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  /** Borra la cuenta en el servidor y la sesión local. */
  async deleteAccount(): Promise<void> {
    const token = await this.accessToken();
    if (token) {
      await firstValueFrom(this.http.delete(`${this.apiUrl}/v1/me`, { headers: { Authorization: `Bearer ${token}` } }));
    }
    this.clear();
  }

  clear(): void {
    this.storage.clear();
    this.current.set(null);
  }

  private async post(path: string, body: object): Promise<Session> {
    const r = await firstValueFrom(this.http.post<SessionResponse>(`${this.apiUrl}${path}`, body));
    const s: Session = {
      userId: r.userId,
      accessToken: r.accessToken,
      accessExpiresAt: Date.parse(r.accessExpiresAt),
      refreshToken: r.refreshToken,
      refreshExpiresAt: Date.parse(r.refreshExpiresAt),
    };
    this.storage.save(s);
    this.current.set(s);
    return s;
  }
}
