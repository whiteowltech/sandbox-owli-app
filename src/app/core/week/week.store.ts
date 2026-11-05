import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';

import { API_URL } from '../api/api-url';
import { AuthService } from '../auth/auth.service';
import type { MacrosDto, OwliMood } from '../diary/diary.model';
import { ProfileSyncService } from '../profile/profile-sync.service';

// Tipos de la API (backend/internal/adapters/httpapi/diary.go, weekDTO).
export interface WeekDay {
  date: string;
  totals: MacrosDto;
  entries: number;
  /** Es hoy: el día no terminó. */
  inProgress: boolean;
  mood: OwliMood;
  /** Calorías ±5 % y proteína a 5 g o más del objetivo. */
  closed: boolean;
}

export interface Week {
  start: string;
  end: string;
  today: string;
  days: WeekDay[];
  target: { kcal: number; proteinG: number };
  review: {
    loggedDays: number;
    closedDays: number;
    proteinShortDays: number;
    overDays: number;
    /** null si no hay días anotados. */
    avgKcal: number | null;
    avgProteinG: number | null;
    streak: number;
  };
}

interface WeekState {
  week: Week | null;
  loading: boolean;
  error: boolean;
}

/** Suma días a una fecha AAAA-MM-DD sin pasar por zonas horarias. */
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "Tu semana": los 7 días que terminan en una fecha (por defecto, hoy). */
export const WeekStore = signalStore(
  { providedIn: 'root' },
  withState<WeekState>({ week: null, loading: false, error: false }),
  withComputed(({ week }) => ({
    /** Se puede avanzar solo hasta la semana que termina hoy. */
    isCurrent: computed(() => !week() || week()!.end >= week()!.today),
  })),
  withMethods(
    (
      store,
      http = inject(HttpClient),
      api = inject(API_URL),
      auth = inject(AuthService),
      sync = inject(ProfileSyncService),
    ) => {
      async function load(end?: string): Promise<void> {
        patchState(store, { loading: true, error: false });
        const url = `${api}/v1/me/week` + (end ? `?end=${end}` : '');
        const get = () => firstValueFrom(http.get<Week>(url));
        try {
          await auth.ensureSession();
          let week: Week;
          try {
            week = await get();
          } catch (err) {
            // El perfil todavía no llegó al servidor: se sube y se reintenta una vez.
            if (!(err instanceof HttpErrorResponse && err.status === 409 && (await sync.sync()))) throw err;
            week = await get();
          }
          patchState(store, { week, loading: false });
        } catch {
          patchState(store, { loading: false, error: true });
        }
      }

      return {
        load,
        previous(): Promise<void> {
          const w = store.week();
          return w ? load(addDays(w.end, -7)) : Promise.resolve();
        },
        next(): Promise<void> {
          const w = store.week();
          if (!w || store.isCurrent()) return Promise.resolve();
          const end = addDays(w.end, 7);
          return load(end > w.today ? w.today : end);
        },
      };
    },
  ),
);
