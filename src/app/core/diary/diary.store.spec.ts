import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_URL } from '../api/api-url';
import { authInterceptor } from '../auth/auth.interceptor';
import { DEMO_PROFILE, ProfileStore } from '../profile/profile.store';

import type { Day, Entry } from './diary.model';
import { DiaryStore } from './diary.store';

const API = 'http://api.test';
const tick = () => new Promise((r) => setTimeout(r, 0));

function day(kcal: number, entries: Entry[] = []): Day {
  return {
    date: '2026-11-03',
    entries,
    totals: { kcal, proteinG: 0, carbsG: 0, fiberG: 0, fatG: 0 },
    plan: { dailyTarget: 2161, tdee: 2711 },
    targets: { proteinG: 160, carbsG: 245, fatG: 60, netCarbs: false },
    mood: 'neutral',
  };
}

function entry(id: string): Entry {
  return {
    id,
    foodId: 'pechuga-pollo',
    nameEs: 'Pechuga de pollo asada',
    nameEn: 'Roasted chicken breast',
    grams: 200,
    eatenAt: '2026-11-03T15:00:00Z',
    source: 'manual',
    macros: { kcal: 330, proteinG: 62, carbsG: 0, fiberG: 0, fatG: 7 },
  };
}

function setup() {
  localStorage.clear();
  // Sesión vigente: los pedidos llevan token sin crear cuenta.
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
  return { diary: TestBed.inject(DiaryStore), backend: TestBed.inject(HttpTestingController) };
}

describe('DiaryStore', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('carga el día y anota una comida', async () => {
    const { diary, backend } = setup();
    const loading = diary.load();
    await tick();
    backend.expectOne(`${API}/v1/me/day`).flush(day(0));
    await loading;
    expect(diary.eatenKcal()).toBe(0);

    const adding = diary.add('pechuga-pollo', 200);
    await tick();
    const post = backend.expectOne({ method: 'POST', url: `${API}/v1/me/entries` });
    expect(post.request.body).toEqual({ foodId: 'pechuga-pollo', grams: 200 });
    expect(post.request.headers.get('Authorization')).toBe('Bearer access-1');
    post.flush(entry('e-1'));
    await tick();
    backend.expectOne(`${API}/v1/me/day`).flush(day(330, [entry('e-1')]));
    expect(await adding).toBe(true);
    expect(diary.eatenKcal()).toBe(330);
    expect(diary.entries().length).toBe(1);
  });

  it('si el perfil todavía no está en el servidor, lo sube y reintenta', async () => {
    const { diary, backend } = setup();
    const loading = diary.load();
    await tick();
    backend
      .expectOne(`${API}/v1/me/day`)
      .flush({ error: { code: 'profile_required' } }, { status: 409, statusText: 'Conflict' });
    await tick();
    backend.expectOne({ method: 'PUT', url: `${API}/v1/me/profile` }).flush({});
    await tick();
    backend.expectOne(`${API}/v1/me/day`).flush(day(0));
    await loading;
    expect(diary.error()).toBeNull();
    expect(diary.day()?.plan.dailyTarget).toBe(2161);
  });

  it('borrar quita la comida al instante y la devuelve si falla', async () => {
    const { diary, backend } = setup();
    const loading = diary.load();
    await tick();
    backend.expectOne(`${API}/v1/me/day`).flush(day(330, [entry('e-1')]));
    await loading;

    const removing = diary.remove('e-1');
    expect(diary.entries().length).toBe(0); // se quita sin esperar al servidor
    await tick();
    backend.expectOne({ method: 'DELETE', url: `${API}/v1/me/entries/e-1` }).error(new ProgressEvent('error'));
    await removing;
    expect(diary.entries().length).toBe(1);
    expect(diary.error()).toBe('offline');
  });

  it('sin conexión, anotar falla sin perder el día cargado', async () => {
    const { diary, backend } = setup();
    const loading = diary.load();
    await tick();
    backend.expectOne(`${API}/v1/me/day`).flush(day(330, [entry('e-1')]));
    await loading;
    const adding = diary.add('pechuga-pollo', 100);
    await tick();
    backend.expectOne(`${API}/v1/me/entries`).error(new ProgressEvent('error'));
    expect(await adding).toBe(false);
    expect(diary.error()).toBe('offline');
    expect(diary.entries().length).toBe(1);
  });

  it('no busca con menos de 2 letras', async () => {
    const { diary } = setup();
    expect(await diary.search('p')).toEqual([]);
  });
});
