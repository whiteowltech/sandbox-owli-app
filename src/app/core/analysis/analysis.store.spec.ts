import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { patchState } from '@ngrx/signals';

import { API_URL } from '../api/api-url';
import { authInterceptor } from '../auth/auth.interceptor';
import type { Food } from '../diary/diary.model';
import { DEMO_PROFILE, ProfileStore } from '../profile/profile.store';

import { AnalysisStore } from './analysis.store';
import { MicUnavailableError, VoiceRecorder } from './recorder';
import { DeviceSpeech, type SpeechFailure } from './speech';

const API = 'http://api.test';
const tick = () => new Promise((r) => setTimeout(r, 0));

const traits = {
  animalOrigin: true,
  plantOrigin: false,
  containsMeat: true,
  containsFish: false,
  containsGrain: false,
  containsLegume: false,
  containsDairy: false,
  containsAddedSugar: false,
  containsGluten: false,
  containsLactose: false,
  allergensVerified: true,
};
const chicken: Food = {
  id: 'pechuga-pollo',
  nameEs: 'Pechuga de pollo asada',
  nameEn: 'Roasted chicken breast',
  per100g: { kcal: 165, proteinG: 31, carbsG: 0, fiberG: 0, fatG: 3.6 },
  traits,
};
const rice: Food = {
  ...chicken,
  id: 'arroz-blanco',
  nameEs: 'Arroz blanco cocido',
  per100g: { ...chicken.per100g, kcal: 130 },
};
const wallet = { freeToday: 0, welcome: 15, packs: 0, total: 15, isPro: false };

const analysisResponse = {
  id: 'a1',
  noFood: false,
  fallback: false,
  credits: wallet,
  items: [
    {
      name: 'chicken breast',
      displayName: 'Pechuga de pollo',
      grams: 150,
      confidence: 0.85,
      needsReview: false,
      food: chicken,
    },
    { name: 'white rice', displayName: 'Arroz blanco', grams: 120, confidence: 0.8, needsReview: false, food: rice },
    {
      name: 'chimichurri sauce',
      displayName: 'salsa chimichurri',
      grams: 30,
      confidence: 0.4,
      needsReview: true,
      food: null,
    },
  ],
};

/** Grabador simulado: en las pruebas no hay micrófono. */
class FakeRecorder {
  denied = false;
  audio = new Blob(['voz'], { type: 'audio/webm' });
  cancelled = false;
  async start(): Promise<void> {
    if (this.denied) throw new MicUnavailableError();
  }
  async stop(): Promise<Blob> {
    return this.audio;
  }
  cancel(): void {
    this.cancelled = true;
  }
}

/** Reconocedor del dispositivo simulado. Por defecto no hay (como en jsdom): se usa el audio. */
class FakeSpeech {
  supported = false;
  text = signal('');
  lang = '';
  fail: ((f: SpeechFailure) => void) | null = null;
  start(lang: string, _onEnd: () => void, onFail: (f: SpeechFailure) => void): void {
    this.lang = lang;
    this.fail = onFail;
  }
  async stop(): Promise<string> {
    return this.text().trim();
  }
  cancel(): void {
    this.text.set('');
  }
}

function setup(recorder = new FakeRecorder(), speech = new FakeSpeech()) {
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
      { provide: VoiceRecorder, useValue: recorder },
      { provide: DeviceSpeech, useValue: speech },
      { provide: TranslocoService, useValue: { getActiveLang: () => 'es' } },
    ],
  });
  TestBed.inject(ProfileStore).save(DEMO_PROFILE);
  return { store: TestBed.inject(AnalysisStore), backend: TestBed.inject(HttpTestingController) };
}

async function analyzed() {
  const ctx = setup();
  const done = ctx.store.analyze(new Blob(['plato'], { type: 'image/jpeg' }));
  expect(ctx.store.phase()).toBe('analyzing');
  await tick();
  await tick();
  const req = ctx.backend.expectOne({ method: 'POST', url: `${API}/v1/me/analyses/photo` });
  expect(req.request.body instanceof FormData).toBe(true);
  expect((req.request.body as FormData).get('photo')).toBeTruthy();
  req.flush(analysisResponse);
  await done;
  return ctx;
}

describe('AnalysisStore', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('arma el borrador para confirmar, con lo dudoso resaltado', async () => {
    const { store } = await analyzed();
    expect(store.phase()).toBe('review');
    expect(store.draft().map((d) => d.displayName)).toEqual(['Pechuga de pollo', 'Arroz blanco', 'Salsa chimichurri']);
    expect(store.draft()[2].needsReview).toBe(true);
    // La salsa no tiene alimento elegido: no se guarda.
    expect(store.savable().length).toBe(2);
    expect(Math.round(store.draftKcal())).toBe(Math.round(1.5 * 165 + 1.2 * 130));
    expect(store.wallet()?.total).toBe(15);
  });

  it('ajustar gramos, elegir el alimento que faltaba y quitar', async () => {
    const { store } = await analyzed();
    store.nudge(0, true);
    expect(store.draft()[0].grams).toBe(165);
    store.nudge(0, false);
    expect(store.draft()[0].grams).toBe(150);
    store.setFood(2, chicken);
    expect(store.draft()[2].needsReview).toBe(false);
    expect(store.savable().length).toBe(3);
    store.remove(1);
    expect(store.savable().length).toBe(2);
    store.undo(1);
    expect(store.savable().length).toBe(3);
  });

  it('guarda como comidas de origen "photo" y no duplica si un reintento sigue después de una falla', async () => {
    const { store, backend } = await analyzed();
    let saving = store.save();
    await tick();
    const first = backend.expectOne(`${API}/v1/me/entries`);
    expect(first.request.body).toEqual({ foodId: 'pechuga-pollo', grams: 150, source: 'photo' });
    first.flush({});
    await tick();
    backend.expectOne(`${API}/v1/me/entries`).error(new ProgressEvent('error')); // se corta la conexión
    expect(await saving).toBe(false);
    expect(store.phase()).toBe('review');

    // Reintento: solo el arroz, el pollo ya estaba guardado.
    saving = store.save();
    await tick();
    const retry = backend.expectOne(`${API}/v1/me/entries`);
    expect(retry.request.body.foodId).toBe('arroz-blanco');
    retry.flush({});
    await tick();
    backend.expectOne(`${API}/v1/me/day`).flush({
      date: '2026-11-03',
      entries: [],
      totals: { kcal: 0, proteinG: 0, carbsG: 0, fiberG: 0, fatG: 0 },
      plan: { dailyTarget: 2161, tdee: 2711 },
      targets: { proteinG: 160, carbsG: 245, fatG: 60, netCarbs: false },
      mood: 'neutral',
    });
    expect(await saving).toBe(true);
    expect(store.phase()).toBe('idle');
  });

  it('si el perfil todavía no llegó al servidor, lo sube y vuelve a pedir los créditos', async () => {
    const { store, backend } = setup();
    const done = store.loadCredits();
    await tick();
    backend
      .expectOne(`${API}/v1/me/credits`)
      .flush({ error: { code: 'profile_required' } }, { status: 409, statusText: 'Conflict' });
    await tick();
    await tick();
    backend.expectOne({ method: 'PUT', url: `${API}/v1/me/profile` }).flush({});
    await tick();
    backend.expectOne(`${API}/v1/me/credits`).flush({ ...wallet, freeToday: 1, total: 16 });
    await done;
    expect(store.wallet()?.total).toBe(16);
  });

  it('sin créditos ofrece anotar a mano; si la IA falla, se puede reintentar', async () => {
    const { store, backend } = setup();
    let done = store.analyze(new Blob(['plato']));
    await tick();
    await tick();
    backend
      .expectOne(`${API}/v1/me/analyses/photo`)
      .flush({ error: { code: 'no_credits' } }, { status: 402, statusText: 'Payment Required' });
    await done;
    expect(store.phase()).toBe('noCredits');

    done = store.analyze(new Blob(['plato']));
    await tick();
    await tick();
    backend.expectOne(`${API}/v1/me/analyses/photo`).flush({}, { status: 503, statusText: 'x' });
    await done;
    expect(store.phase()).toBe('error');

    const retry = store.retry();
    await tick();
    await tick();
    backend.expectOne(`${API}/v1/me/analyses/photo`).flush({ ...analysisResponse, items: [], noFood: true });
    await retry;
    expect(store.phase()).toBe('noFood');
  });

  describe('voz', () => {
    it('graba, transcribe y guarda como comidas de origen "voice"', async () => {
      const { store, backend } = setup();
      await store.startRecording();
      expect(store.phase()).toBe('recording');
      const done = store.finishRecording();
      await tick();
      await tick();
      const req = backend.expectOne({ method: 'POST', url: `${API}/v1/me/analyses/voice` });
      expect((req.request.body as FormData).get('audio')).toBeTruthy();
      expect((req.request.body as FormData).get('photo')).toBeNull();
      req.flush({ ...analysisResponse, transcript: 'pollo con arroz' });
      await done;
      expect(store.phase()).toBe('review');
      expect(store.kind()).toBe('voice');
      expect(store.transcript()).toBe('pollo con arroz');

      const saving = store.save();
      await tick();
      const first = backend.expectOne(`${API}/v1/me/entries`);
      expect(first.request.body.source).toBe('voice');
      first.flush({});
      await tick();
      backend.expectOne(`${API}/v1/me/entries`).flush({});
      await tick();
      backend.expectOne(`${API}/v1/me/day`).flush({
        date: '2026-11-03',
        entries: [],
        totals: { kcal: 0, proteinG: 0, carbsG: 0, fiberG: 0, fatG: 0 },
        plan: { dailyTarget: 2161, tdee: 2711 },
        targets: { proteinG: 160, carbsG: 245, fatG: 60, netCarbs: false },
        mood: 'neutral',
      });
      expect(await saving).toBe(true);
      expect(store.transcript()).toBe('');
    });

    it('sin permiso de micrófono ofrece las otras vías; una grabación vacía no se envía', async () => {
      const denied = new FakeRecorder();
      denied.denied = true;
      const { store } = setup(denied);
      await store.startRecording();
      expect(store.phase()).toBe('micError');
      denied.denied = false;
      denied.audio = new Blob([]);
      await store.startRecording();
      await store.finishRecording();
      expect(store.phase()).toBe('noFood'); // HttpTestingController.verify: no hubo pedido
    });

    it('cancelar libera el micrófono y un reintento repite el audio', async () => {
      const recorder = new FakeRecorder();
      const { store, backend } = setup(recorder);
      await store.startRecording();
      store.close();
      expect(recorder.cancelled).toBe(true);
      expect(store.phase()).toBe('idle');

      await store.startRecording();
      const done = store.finishRecording();
      await tick();
      await tick();
      backend.expectOne(`${API}/v1/me/analyses/voice`).flush({}, { status: 503, statusText: 'x' });
      await done;
      expect(store.phase()).toBe('error');
      const retry = store.retry();
      await tick();
      await tick();
      backend.expectOne(`${API}/v1/me/analyses/voice`).flush({ ...analysisResponse, items: [], noFood: true });
      await retry;
      expect(store.phase()).toBe('noFood');
    });
  });

  describe('voz en el dispositivo', () => {
    const device = () => {
      const speech = new FakeSpeech();
      speech.supported = true;
      return speech;
    };

    it('transcribe en el dispositivo y manda solo el texto (sin audio)', async () => {
      const speech = device();
      const recorder = new FakeRecorder();
      const { store, backend } = setup(recorder, speech);
      await store.startRecording();
      expect(store.capture()).toBe('device');
      expect(speech.lang.startsWith('es')).toBe(true);
      speech.text.set('dos empanadas de carne ');
      const done = store.finishRecording();
      await tick();
      await tick();
      const req = backend.expectOne({ method: 'POST', url: `${API}/v1/me/analyses/text` });
      expect(req.request.body).toEqual({ text: 'dos empanadas de carne' });
      req.flush({ ...analysisResponse, transcript: 'dos empanadas de carne' });
      await done;
      expect(store.phase()).toBe('review');
      expect(store.transcript()).toBe('dos empanadas de carne');
    });

    it('si el dispositivo falla, graba el audio para el servidor (respaldo)', async () => {
      const speech = device();
      const { store, backend } = setup(new FakeRecorder(), speech);
      await store.startRecording();
      await speech.fail!('unavailable');
      expect(store.capture()).toBe('audio');
      expect(store.phase()).toBe('recording');
      const done = store.finishRecording();
      await tick();
      await tick();
      backend.expectOne(`${API}/v1/me/analyses/voice`).flush(analysisResponse);
      await done;
      expect(store.phase()).toBe('review');
    });

    it('sin permiso de micrófono no intenta el respaldo; sin texto no envía nada', async () => {
      const speech = device();
      const { store } = setup(new FakeRecorder(), speech);
      await store.startRecording();
      await speech.fail!('denied');
      expect(store.phase()).toBe('micError');

      await store.startRecording();
      await store.finishRecording(); // no dijo nada
      expect(store.phase()).toBe('noFood');
    });

    it('el micrófono se ofrece solo si hay algún camino', () => {
      const { store } = setup(); // dispositivo sin reconocimiento
      expect(store.voiceAvailable()).toBe(true); // sin saber qué acepta el servidor, se ofrece
      patchState(store as never, { wallet: { ...wallet, voice: { transcript: true, audio: false } } });
      expect(store.voiceAvailable()).toBe(false); // ni dispositivo ni Whisper
      patchState(store as never, { wallet: { ...wallet, voice: { transcript: true, audio: true } } });
      expect(store.voiceAvailable()).toBe(true);
    });
  });
});

describe('AnalysisStore: unidades y recetas', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  const egg: Food = { ...chicken, id: 'huevo', nameEs: 'Huevo entero', per100g: { ...chicken.per100g, kcal: 143 } };
  const milk: Food = {
    ...chicken,
    id: 'leche-entera',
    nameEs: 'Leche entera',
    per100g: { ...chicken.per100g, kcal: 61 },
  };

  async function waffles(servings: number) {
    const ctx = setup();
    const done = ctx.store.analyze(new Blob(['waffles'], { type: 'image/jpeg' }));
    await tick();
    await tick();
    ctx.backend.expectOne({ method: 'POST', url: `${API}/v1/me/analyses/photo` }).flush({
      id: 'a2',
      noFood: false,
      fallback: false,
      credits: wallet,
      recipe: { name: 'Waffles proteicos', servings },
      items: [
        {
          name: 'whole egg',
          displayName: 'Huevo entero',
          grams: 100,
          confidence: 0.9,
          needsReview: false,
          food: egg,
          quantity: 2,
          unitOne: 'huevo',
          unitMany: 'huevos',
          unitGrams: 50,
        },
        {
          name: 'whole milk',
          displayName: 'Leche entera',
          grams: 200,
          confidence: 0.8,
          needsReview: false,
          food: milk,
          quantity: 1,
          unitOne: 'vaso',
          unitMany: 'vasos',
          unitGrams: 200,
        },
      ],
    });
    await done;
    return ctx;
  }

  it('cuenta en unidades: los botones suman o restan de a una', async () => {
    const { store } = await waffles(4);
    const eggs = () => store.draft()[0];
    expect(eggs().quantity).toBe(2);
    store.nudge(0, true);
    expect([eggs().quantity, eggs().grams]).toEqual([3, 150]);
    store.nudge(0, false);
    store.nudge(0, false);
    expect([eggs().quantity, eggs().grams]).toEqual([1, 50]);
    // Por debajo de una unidad, de a media; nunca cero.
    store.nudge(0, false);
    store.nudge(0, false);
    expect([eggs().quantity, eggs().grams]).toEqual([0.5, 25]);
  });

  it('una receta que rinde 4 empieza en una porción y anota solo eso', async () => {
    const { store, backend } = await waffles(4);
    // Toda la receta: 143 + 122 = 265 kcal; una porción = 66,25.
    expect(store.recipe()?.name).toBe('Waffles proteicos');
    expect(store.portion()).toBe(0.25);
    expect(Math.round(store.draftKcal())).toBe(66);

    store.setPortion(0.5);
    const saving = store.save();
    await tick();
    const req = backend.expectOne({ method: 'POST', url: `${API}/v1/me/recipes` });
    expect(req.request.body).toEqual({
      name: 'Waffles proteicos',
      servings: 4,
      ingredients: [
        { foodId: 'huevo', grams: 100 },
        { foodId: 'leche-entera', grams: 200 },
      ],
      eatenGrams: 150,
      source: 'photo',
    });
    req.flush({});
    await tick();
    backend.expectOne(`${API}/v1/me/day`).flush({
      date: '2026-11-09',
      entries: [],
      totals: { kcal: 0, proteinG: 0, carbsG: 0, fiberG: 0, fatG: 0 },
      plan: { dailyTarget: 2161, tdee: 2711 },
      targets: { proteinG: 160, carbsG: 245, fatG: 60, netCarbs: false },
      mood: 'neutral',
    });
    expect(await saving).toBe(true);
    expect(store.recipe()).toBeNull();
  });

  it('sin porciones conocidas, empieza en "todo"', async () => {
    const { store } = await waffles(0);
    expect(store.portion()).toBe(1);
  });
});
