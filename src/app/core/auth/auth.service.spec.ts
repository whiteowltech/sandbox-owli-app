import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { API_URL } from '../api/api-url';

import { authInterceptor } from './auth.interceptor';
import { AuthService, SessionLostError } from './auth.service';

const API = 'http://api.test';
const flushMicrotasks = () => new Promise((r) => setTimeout(r, 0));

function sessionBody(n: number, accessInMs = 15 * 60_000) {
  return {
    userId: 'u-1',
    accessToken: `access-${n}`,
    accessExpiresAt: new Date(Date.now() + accessInMs).toISOString(),
    refreshToken: `refresh-${n}`,
    refreshExpiresAt: new Date(Date.now() + 60 * 86_400_000).toISOString(),
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
  return {
    auth: TestBed.inject(AuthService),
    http: TestBed.inject(HttpClient),
    backend: TestBed.inject(HttpTestingController),
  };
}

describe('AuthService', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('crea una sola cuenta anónima aunque se pida dos veces a la vez', async () => {
    const { auth, backend } = setup();
    const a = auth.ensureSession();
    const b = auth.ensureSession();
    backend.expectOne({ method: 'POST', url: `${API}/v1/auth/anonymous` }).flush(sessionBody(1));
    expect((await a).accessToken).toBe('access-1');
    expect(await b).toEqual(await a);
    expect(JSON.parse(localStorage.getItem('owli:session:v1') ?? '{}').refreshToken).toBe('refresh-1');
  });

  it('renueva cuando el access token está por vencer, una sola vez para pedidos simultáneos', async () => {
    const { auth, backend } = setup();
    const created = auth.ensureSession();
    backend.expectOne(`${API}/v1/auth/anonymous`).flush(sessionBody(1, 10_000)); // vence en 10 s
    await created;

    const t1 = auth.accessToken();
    const t2 = auth.accessToken();
    await flushMicrotasks();
    const req = backend.expectOne(`${API}/v1/auth/refresh`);
    expect(req.request.body).toEqual({ refreshToken: 'refresh-1' });
    req.flush(sessionBody(2));
    expect(await t1).toBe('access-2');
    expect(await t2).toBe('access-2');
    expect(await auth.accessToken()).toBe('access-2'); // vigente: sin pedidos nuevos
  });

  it('si el servidor rechaza la renovación, la sesión se pierde', async () => {
    const { auth, backend } = setup();
    const created = auth.ensureSession();
    backend.expectOne(`${API}/v1/auth/anonymous`).flush(sessionBody(1));
    await created;

    const r = auth.refresh();
    backend
      .expectOne(`${API}/v1/auth/refresh`)
      .flush({ error: { code: 'invalid_session' } }, { status: 401, statusText: 'x' });
    await expect(r).rejects.toBeInstanceOf(SessionLostError);
    expect(auth.session()).toBeNull();
    expect(localStorage.getItem('owli:session:v1')).toBeNull();
  });

  it('sin conexión, la sesión se conserva para reintentar', async () => {
    const { auth, backend } = setup();
    const created = auth.ensureSession();
    backend.expectOne(`${API}/v1/auth/anonymous`).flush(sessionBody(1));
    await created;

    const r = auth.refresh();
    backend.expectOne(`${API}/v1/auth/refresh`).error(new ProgressEvent('error'));
    await expect(r).rejects.not.toBeInstanceOf(SessionLostError);
    expect(auth.session()?.refreshToken).toBe('refresh-1');
  });

  it('borrar la cuenta llama al servidor y limpia la sesión', async () => {
    const { auth, backend } = setup();
    const created = auth.ensureSession();
    backend.expectOne(`${API}/v1/auth/anonymous`).flush(sessionBody(1));
    await created;
    const del = auth.deleteAccount();
    await flushMicrotasks();
    const req = backend.expectOne({ method: 'DELETE', url: `${API}/v1/me` });
    expect(req.request.headers.get('Authorization')).toBe('Bearer access-1');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await del;
    expect(auth.session()).toBeNull();
  });
});

describe('authInterceptor', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  async function withSession() {
    const ctx = setup();
    const created = ctx.auth.ensureSession();
    ctx.backend.expectOne(`${API}/v1/auth/anonymous`).flush(sessionBody(1));
    await created;
    return ctx;
  }

  it('adjunta el token solo a la API de Owli', async () => {
    const { http, backend } = await withSession();
    const api = firstValueFrom(http.get(`${API}/v1/me/profile`));
    const other = firstValueFrom(http.get('https://otro.example/x'));
    await flushMicrotasks();
    const r1 = backend.expectOne(`${API}/v1/me/profile`);
    expect(r1.request.headers.get('Authorization')).toBe('Bearer access-1');
    r1.flush({});
    const r2 = backend.expectOne('https://otro.example/x');
    expect(r2.request.headers.has('Authorization')).toBe(false);
    r2.flush({});
    await Promise.all([api, other]);
  });

  it('ante un 401 renueva una vez y reintenta', async () => {
    const { http, backend } = await withSession();
    const res = firstValueFrom(http.get<{ ok: boolean }>(`${API}/v1/me/profile`));
    await flushMicrotasks();
    backend.expectOne(`${API}/v1/me/profile`).flush({}, { status: 401, statusText: 'x' });
    await flushMicrotasks();
    backend.expectOne(`${API}/v1/auth/refresh`).flush(sessionBody(2));
    await flushMicrotasks();
    const retry = backend.expectOne(`${API}/v1/me/profile`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer access-2');
    retry.flush({ ok: true });
    expect(await res).toEqual({ ok: true });
  });
});
