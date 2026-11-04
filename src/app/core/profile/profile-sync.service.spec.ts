import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_URL } from '../api/api-url';
import { authInterceptor } from '../auth/auth.interceptor';

import { ProfileSyncService } from './profile-sync.service';
import { DEMO_PROFILE, ProfileStore } from './profile.store';

const API = 'http://api.test';
const tick = () => new Promise((r) => setTimeout(r, 0));

function session(n: number) {
  return {
    userId: `u-${n}`,
    accessToken: `access-${n}`,
    accessExpiresAt: new Date(Date.now() + 900_000).toISOString(),
    refreshToken: `refresh-${n}`,
    refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: API },
    ],
  });
  TestBed.inject(ProfileStore).save({ ...DEMO_PROFILE, diet: 'paleo', restrictions: ['gluten_free'] });
  return { sync: TestBed.inject(ProfileSyncService), backend: TestBed.inject(HttpTestingController) };
}

describe('ProfileSyncService', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('crea la cuenta anónima y sube el perfil con la zona horaria', async () => {
    const { sync, backend } = setup();
    const done = sync.sync();
    await tick();
    backend.expectOne(`${API}/v1/auth/anonymous`).flush(session(1));
    await tick();
    const put = backend.expectOne({ method: 'PUT', url: `${API}/v1/me/profile` });
    expect(put.request.headers.get('Authorization')).toBe('Bearer access-1');
    expect(put.request.body).toMatchObject({ diet: 'paleo', restrictions: ['gluten_free'] });
    expect(typeof put.request.body.timezone).toBe('string');
    put.flush({});
    expect(await done).toBe(true);
    expect(sync.status()).toBe('synced');
    expect(localStorage.getItem('owli:profile-sync:pending')).toBeNull();
  });

  it('sin conexión queda pendiente y se reintenta después', async () => {
    const { sync, backend } = setup();
    const first = sync.sync();
    await tick();
    backend.expectOne(`${API}/v1/auth/anonymous`).error(new ProgressEvent('error'));
    expect(await first).toBe(false);
    expect(sync.status()).toBe('pending');
    expect(localStorage.getItem('owli:profile-sync:pending')).toBe('1');

    const retry = sync.retryIfPending();
    await tick();
    backend.expectOne(`${API}/v1/auth/anonymous`).flush(session(1));
    await tick();
    backend.expectOne(`${API}/v1/me/profile`).flush({});
    expect(await retry).toBe(true);
    expect(await sync.retryIfPending()).toBe(false); // ya no queda nada pendiente
  });

  it('si la sesión se perdió, abre otra y vuelve a subir el perfil', async () => {
    const { sync, backend } = setup();
    const first = sync.sync();
    await tick();
    backend.expectOne(`${API}/v1/auth/anonymous`).flush(session(1));
    await tick();
    backend.expectOne(`${API}/v1/me/profile`).flush({}, { status: 401, statusText: 'x' });
    await tick();
    backend.expectOne(`${API}/v1/auth/refresh`).flush({}, { status: 401, statusText: 'x' });
    await tick();
    backend.expectOne(`${API}/v1/auth/anonymous`).flush(session(2));
    await tick();
    const put = backend.expectOne(`${API}/v1/me/profile`);
    expect(put.request.headers.get('Authorization')).toBe('Bearer access-2');
    put.flush({});
    expect(await first).toBe(true);
  });

  it('un perfil inválido para el servidor no queda reintentándose en silencio', async () => {
    const { sync, backend } = setup();
    const done = sync.sync();
    await tick();
    backend.expectOne(`${API}/v1/auth/anonymous`).flush(session(1));
    await tick();
    backend
      .expectOne(`${API}/v1/me/profile`)
      .flush({ error: { code: 'invalid_profile' } }, { status: 422, statusText: 'x' });
    expect(await done).toBe(false);
    expect(sync.status()).toBe('pending');
  });
});
