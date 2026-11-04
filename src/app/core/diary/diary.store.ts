import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';

import { API_URL } from '../api/api-url';
import { AuthService } from '../auth/auth.service';
import { ProfileSyncService } from '../profile/profile-sync.service';

import type { Day, Entry, Food } from './diary.model';

export type DiaryError = 'offline' | 'unknown';

interface DiaryState {
  day: Day | null;
  loading: boolean;
  saving: boolean;
  error: DiaryError | null;
}

function classify(err: unknown): DiaryError {
  return err instanceof HttpErrorResponse && err.status === 0 ? 'offline' : 'unknown';
}

/**
 * El día del usuario desde la API. Registrar a mano es gratis: no usa créditos.
 * La API corta el día en la zona horaria del perfil, no en la del servidor.
 */
export const DiaryStore = signalStore(
  { providedIn: 'root' },
  withState<DiaryState>({ day: null, loading: false, saving: false, error: null }),
  withComputed(({ day }) => ({
    entries: computed<Entry[]>(() => day()?.entries ?? []),
    eatenKcal: computed(() => day()?.totals.kcal ?? 0),
  })),
  withMethods(
    (
      store,
      http = inject(HttpClient),
      api = inject(API_URL),
      auth = inject(AuthService),
      sync = inject(ProfileSyncService),
    ) => {
      async function fetchDay(): Promise<Day> {
        await auth.ensureSession();
        try {
          return await firstValueFrom(http.get<Day>(`${api}/v1/me/day`));
        } catch (err) {
          // El perfil todavía no llegó al servidor (p. ej. se completó sin conexión): se sube y se reintenta.
          if (err instanceof HttpErrorResponse && err.status === 409 && (await sync.sync())) {
            return firstValueFrom(http.get<Day>(`${api}/v1/me/day`));
          }
          throw err;
        }
      }

      return {
        async load(): Promise<void> {
          patchState(store, { loading: true, error: null });
          try {
            patchState(store, { day: await fetchDay(), loading: false });
          } catch (err) {
            patchState(store, { loading: false, error: classify(err) });
          }
        },

        async search(query: string): Promise<Food[]> {
          if (query.trim().length < 2) return [];
          await auth.ensureSession();
          const res = await firstValueFrom(
            http.get<{ foods: Food[] }>(`${api}/v1/foods`, { params: { q: query.trim(), limit: 20 } }),
          );
          return res.foods;
        },

        /** Anota una porción. Devuelve false si no se pudo (el error queda en el estado). */
        async add(foodId: string, grams: number): Promise<boolean> {
          patchState(store, { saving: true, error: null });
          try {
            await auth.ensureSession();
            await firstValueFrom(http.post<Entry>(`${api}/v1/me/entries`, { foodId, grams }));
            patchState(store, { day: await fetchDay(), saving: false });
            return true;
          } catch (err) {
            patchState(store, { saving: false, error: classify(err) });
            return false;
          }
        },

        /** Borra una comida. Se quita al instante y vuelve si el servidor falla. */
        async remove(entryId: string): Promise<void> {
          const before = store.day();
          if (!before) return;
          patchState(store, {
            day: { ...before, entries: before.entries.filter((e) => e.id !== entryId) },
            error: null,
          });
          try {
            await firstValueFrom(http.delete(`${api}/v1/me/entries/${encodeURIComponent(entryId)}`));
            patchState(store, { day: await fetchDay() });
          } catch (err) {
            patchState(store, { day: before, error: classify(err) });
          }
        },

        clear(): void {
          patchState(store, { day: null, error: null });
        },
      };
    },
  ),
);
