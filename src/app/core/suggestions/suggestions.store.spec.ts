import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_URL } from '../api/api-url';
import { authInterceptor } from '../auth/auth.interceptor';
import type { Food } from '../diary/diary.model';
import { DEMO_PROFILE, ProfileStore } from '../profile/profile.store';

import { type Closing, SuggestionsStore } from './suggestions.store';

const API = 'http://api.test';
const tick = () => new Promise((r) => setTimeout(r, 0));

const food = (id: string): Food => ({
  id,
  nameEs: id,
  nameEn: id,
  per100g: { kcal: 100, proteinG: 10, carbsG: 10, fiberG: 0, fatG: 2 },
  traits: {
    animalOrigin: false,
    plantOrigin: true,
    containsMeat: false,
    containsFish: false,
    containsGrain: false,
    containsLegume: false,
    containsDairy: false,
    containsAddedSugar: false,
    containsGluten: false,
    containsLactose: false,
    allergensVerified: true,
  },
});

const closing: Closing = {
  mealsLeft: 2,
  need: { kcal: 600, proteinG: 45, carbsG: 60, fiberG: 0, fatG: 20 },
  netCarbs: false,
  closed: false,
  dishes: [
    {
      id: 'pollo-arroz',
      nameEs: 'Pollo con arroz',
      nameEn: 'Chicken with rice',
      exact: true,
      macros: { kcal: 598, proteinG: 45, carbsG: 60, fiberG: 1, fatG: 20 },
      portions: [
        { grams: 120, food: food('pechuga-pollo') },
        { grams: 215, food: food('arroz-blanco') },
      ],
    },
  ],
};

const emptyDay = {
  date: '2026-11-04',
  entries: [],
  totals: { kcal: 0, proteinG: 0, carbsG: 0, fiberG: 0, fatG: 0 },
  plan: { dailyTarget: 2161, tdee: 2711 },
  targets: { proteinG: 160, carbsG: 245, fatG: 60, netCarbs: false },
  mood: 'neutral',
};

function setup() {
  localStorage.clear();
  localStorage.setItem(
    'owli:session:v1',
    JSON.stringify({
      userId: 'u-1',
      accessToken: 'access-1',
      accessExpiresAt: Date.now() + 900_000,
      refreshToken: 'refresh-1',
      refreshExpiresAt: Date.now() + 86_400_000,
    }),
  );
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: API },
    ],
  });
  TestBed.inject(ProfileStore).save(DEMO_PROFILE);
  return { store: TestBed.inject(SuggestionsStore), backend: TestBed.inject(HttpTestingController) };
}

describe('SuggestionsStore', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('si el perfil no llegó al servidor, lo sube y vuelve a pedir las sugerencias', async () => {
    const { store, backend } = setup();
    const done = store.load();
    expect(store.loading()).toBe(true);
    await tick();
    backend.expectOne(`${API}/v1/me/suggestions`).flush({}, { status: 409, statusText: 'Conflict' });
    await tick();
    await tick();
    backend.expectOne({ method: 'PUT', url: `${API}/v1/me/profile` }).flush({});
    await tick();
    backend.expectOne(`${API}/v1/me/suggestions`).flush(closing);
    await done;
    expect(store.closing()?.dishes[0].id).toBe('pollo-arroz');
    expect(store.loading()).toBe(false);
  });

  it('anota cada porción como "suggestion" y no duplica si se reintenta tras una falla', async () => {
    const { store, backend } = setup();
    const loading = store.load();
    await tick();
    backend.expectOne(`${API}/v1/me/suggestions`).flush(closing);
    await loading;
    const dish = store.closing()!.dishes[0];

    let saving = store.logDish(dish);
    expect(store.logging()).toBe('pollo-arroz');
    await tick();
    const first = backend.expectOne(`${API}/v1/me/entries`);
    expect(first.request.body).toEqual({ foodId: 'pechuga-pollo', grams: 120, source: 'suggestion' });
    first.flush({});
    await tick();
    backend.expectOne(`${API}/v1/me/entries`).error(new ProgressEvent('error'));
    expect(await saving).toBe(false);
    expect(store.error()).toBe(true);

    // Reintento: solo el arroz.
    saving = store.logDish(dish);
    await tick();
    const retry = backend.expectOne(`${API}/v1/me/entries`);
    expect(retry.request.body.foodId).toBe('arroz-blanco');
    retry.flush({});
    await tick();
    backend.expectOne(`${API}/v1/me/day`).flush(emptyDay);
    expect(await saving).toBe(true);
    expect(store.closing()).toBeNull(); // se recalcula al volver a abrir
  });

  it('un error de red se muestra y se puede reintentar', async () => {
    const { store, backend } = setup();
    const done = store.load();
    await tick();
    backend.expectOne(`${API}/v1/me/suggestions`).error(new ProgressEvent('error'));
    await done;
    expect(store.error()).toBe(true);
    expect(store.closing()).toBeNull();
  });
});
