import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';

import { API_URL } from '../api/api-url';
import { AuthService } from '../auth/auth.service';
import type { Food, MacrosDto } from '../diary/diary.model';
import { DiaryStore } from '../diary/diary.store';
import { ProfileSyncService } from '../profile/profile-sync.service';

// Tipos de la API (backend/internal/adapters/httpapi/suggestions.go).
export interface Portion {
  grams: number;
  food: Food;
}

export interface Dish {
  id: string;
  nameEs: string;
  nameEn: string;
  /** Cierra lo que falta dentro de ±5 % de kcal y ±5 g de proteína. */
  exact: boolean;
  /** Acompañamiento sin fuente de proteína: fruta, arroz, pan… */
  side: boolean;
  macros: MacrosDto;
  portions: Portion[];
}

export interface Closing {
  mealsLeft: number;
  /** Lo que falta para esta comida; en keto, carbsG son carbos netos. */
  need: MacrosDto;
  /** Cuánto se pasó el día de cada macro: con grasa o carbos pasados, los platos casi no suman de eso. */
  over: MacrosDto;
  netCarbs: boolean;
  /** El día ya está cubierto: no hay platos. */
  closed: boolean;
  dishes: Dish[];
}

interface SuggestionsState {
  closing: Closing | null;
  loading: boolean;
  error: boolean;
  /** Plato que se está anotando. */
  logging: string | null;
  /** Porciones ya anotadas por plato: si falla a mitad, el reintento no duplica. */
  saved: Record<string, number>;
}

/**
 * Meal Closing Engine en la app: qué comer ahora. Los platos los calcula el
 * servidor (domain.SuggestDishes, con la dieta y las restricciones); anotar uno
 * es gratis: no usa IA ni créditos.
 */
export const SuggestionsStore = signalStore(
  { providedIn: 'root' },
  withState<SuggestionsState>({ closing: null, loading: false, error: false, logging: null, saved: {} }),
  withMethods(
    (
      store,
      http = inject(HttpClient),
      api = inject(API_URL),
      auth = inject(AuthService),
      diary = inject(DiaryStore),
      sync = inject(ProfileSyncService),
    ) => ({
      async load(): Promise<void> {
        patchState(store, { loading: true, error: false });
        const get = () => firstValueFrom(http.get<Closing>(`${api}/v1/me/suggestions`));
        try {
          await auth.ensureSession();
          let closing: Closing;
          try {
            closing = await get();
          } catch (err) {
            // El perfil todavía no llegó al servidor: se sube y se reintenta una vez.
            if (!(err instanceof HttpErrorResponse && err.status === 409 && (await sync.sync()))) throw err;
            closing = await get();
          }
          patchState(store, { closing, loading: false, saved: {} });
        } catch {
          patchState(store, { loading: false, error: true });
        }
      },

      /** Anota cada porción del plato como comida de origen "suggestion". */
      async logDish(dish: Dish): Promise<boolean> {
        patchState(store, { logging: dish.id, error: false });
        try {
          for (let i = store.saved()[dish.id] ?? 0; i < dish.portions.length; i++) {
            const p = dish.portions[i];
            await firstValueFrom(
              http.post(`${api}/v1/me/entries`, { foodId: p.food.id, grams: p.grams, source: 'suggestion' }),
            );
            patchState(store, { saved: { ...store.saved(), [dish.id]: i + 1 } });
          }
          await diary.load();
          patchState(store, { logging: null, closing: null, saved: {} });
          return true;
        } catch {
          patchState(store, { logging: null, error: true });
          return false;
        }
      },
    }),
  ),
);
