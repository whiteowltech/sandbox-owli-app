import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';

import { API_URL } from '../api/api-url';
import { AuthService } from '../auth/auth.service';
import { ProfileSyncService } from '../profile/profile-sync.service';

import type { Day, Entry, Food, MacrosDto } from './diary.model';

export type DiaryError = 'offline' | 'unknown';

/** Cuánto tiempo se ofrece "Deshacer" después de borrar una comida. */
export const UNDO_MS = 5000;

interface DiaryState {
  day: Day | null;
  loading: boolean;
  saving: boolean;
  error: DiaryError | null;
  /** Comida borrada que todavía se puede recuperar con "Deshacer". */
  removed: Entry | null;
}

function plus(a: MacrosDto, b: MacrosDto, sign = 1): MacrosDto {
  return {
    kcal: a.kcal + sign * b.kcal,
    proteinG: a.proteinG + sign * b.proteinG,
    carbsG: a.carbsG + sign * b.carbsG,
    fiberG: a.fiberG + sign * b.fiberG,
    fatG: a.fatG + sign * b.fatG,
  };
}

/** El día con la comida de vuelta, en su lugar según la hora. */
function withEntry(day: Day, e: Entry): Day {
  const entries = [...day.entries, e].sort((a, b) => a.eatenAt.localeCompare(b.eatenAt));
  return { ...day, entries, totals: plus(day.totals, e.macros) };
}

/** El día sin la comida borrada: ni en la lista ni en los totales. */
function without(day: Day, e: Entry | null): Day {
  if (!e || !day.entries.some((x) => x.id === e.id)) return day;
  return { ...day, entries: day.entries.filter((x) => x.id !== e.id), totals: plus(day.totals, e.macros, -1) };
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
  withState<DiaryState>({ day: null, loading: false, saving: false, error: null, removed: null }),
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

      let undoTimer: ReturnType<typeof setTimeout> | undefined;

      /** Deja de ofrecer "Deshacer". */
      function forgetRemoved(): void {
        clearTimeout(undoTimer);
        patchState(store, { removed: null });
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

        /**
         * Borra una comida: se quita al instante, se borra en el servidor y durante
         * UNDO_MS se ofrece "Deshacer". Si el servidor falla, la comida vuelve.
         */
        async remove(entryId: string): Promise<void> {
          const before = store.day();
          const e = before?.entries.find((x) => x.id === entryId);
          if (!before || !e) return;
          clearTimeout(undoTimer);
          patchState(store, { day: without(before, e), removed: e, error: null });
          try {
            await firstValueFrom(http.delete(`${api}/v1/me/entries/${encodeURIComponent(e.id)}`));
          } catch (err) {
            const d = store.day();
            patchState(store, { day: d && withEntry(d, e), removed: null, error: classify(err) });
            return;
          }
          if (store.removed() === e) undoTimer = setTimeout(forgetRemoved, UNDO_MS);
          // El ánimo de Owli y los totales exactos los recalcula el servidor.
          try {
            patchState(store, { day: await fetchDay() });
          } catch {
            // El borrado ya quedó hecho; el día se actualiza en la próxima carga.
          }
        },

        /**
         * Vuelve a anotar la comida recién borrada, con su hora y su origen (un análisis
         * de IA deshecho no se cobra de nuevo: se anota como estaba).
         */
        async undoRemove(): Promise<void> {
          const e = store.removed();
          const d = store.day();
          if (!e || !d) return;
          forgetRemoved();
          patchState(store, { day: withEntry(d, e), error: null });
          try {
            await firstValueFrom(
              http.post<Entry>(`${api}/v1/me/entries`, {
                foodId: e.foodId,
                grams: e.grams,
                eatenAt: e.eatenAt,
                source: e.source,
              }),
            );
            patchState(store, { day: await fetchDay() });
          } catch (err) {
            const now = store.day();
            patchState(store, { day: now && without(now, e), error: classify(err) });
          }
        },

        clear(): void {
          clearTimeout(undoTimer);
          patchState(store, { day: null, error: null, removed: null });
        },
      };
    },
  ),
);
