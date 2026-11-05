import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_URL } from '../api/api-url';
import { authInterceptor } from '../auth/auth.interceptor';
import { DEMO_PROFILE, ProfileStore } from '../profile/profile.store';

import { addDays, type Week, WeekStore } from './week.store';

const API = 'http://api.test';
const tick = () => new Promise((r) => setTimeout(r, 0));

function week(end: string, today = '2026-11-04'): Week {
  const days = Array.from({ length: 7 }, (_, i) => ({
    date: addDays(end, i - 6),
    totals: { kcal: 0, proteinG: 0, carbsG: 0, fiberG: 0, fatG: 0 },
    entries: 0,
    inProgress: addDays(end, i - 6) === today,
    mood: 'neutral' as const,
    closed: false,
  }));
  return {
    start: addDays(end, -6),
    end,
    today,
    days,
    target: { kcal: 2000, proteinG: 150 },
    review: {
      loggedDays: 0,
      closedDays: 0,
      proteinShortDays: 0,
      overDays: 0,
      avgKcal: null,
      avgProteinG: null,
      streak: 0,
    },
  };
}

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
  return { store: TestBed.inject(WeekStore), backend: TestBed.inject(HttpTestingController) };
}

describe('addDays', () => {
  it('addDays cruza meses y años sin depender de la zona horaria', () => {
    expect(addDays('2026-11-04', -6)).toBe('2026-10-29');
    expect(addDays('2026-12-30', 7)).toBe('2027-01-06');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('WeekStore', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('carga la semana actual y navega hacia atrás y adelante, nunca al futuro', async () => {
    const { store, backend } = setup();
    let done = store.load();
    await tick();
    backend.expectOne(`${API}/v1/me/week`).flush(week('2026-11-04'));
    await done;
    expect(store.isCurrent()).toBe(true);

    await store.next(); // ya es la actual: no pide nada
    done = store.previous();
    await tick();
    backend.expectOne(`${API}/v1/me/week?end=2026-10-28`).flush(week('2026-10-28'));
    await done;
    expect(store.isCurrent()).toBe(false);

    done = store.next();
    await tick();
    backend.expectOne(`${API}/v1/me/week?end=2026-11-04`).flush(week('2026-11-04'));
    await done;
    expect(store.isCurrent()).toBe(true);
  });

  it('si el perfil no llegó al servidor, lo sube y reintenta; un error de red se muestra', async () => {
    const { store, backend } = setup();
    let done = store.load();
    await tick();
    backend.expectOne(`${API}/v1/me/week`).flush({}, { status: 409, statusText: 'Conflict' });
    await tick();
    await tick();
    backend.expectOne({ method: 'PUT', url: `${API}/v1/me/profile` }).flush({});
    await tick();
    backend.expectOne(`${API}/v1/me/week`).flush(week('2026-11-04'));
    await done;
    expect(store.week()?.end).toBe('2026-11-04');

    done = store.load();
    await tick();
    backend.expectOne(`${API}/v1/me/week`).error(new ProgressEvent('error'));
    await done;
    expect(store.error()).toBe(true);
  });
});
