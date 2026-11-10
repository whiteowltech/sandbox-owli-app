import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';

import { API_URL } from '../api/api-url';
import { AuthService } from '../auth/auth.service';
import type { Food } from '../diary/diary.model';
import { DiaryStore } from '../diary/diary.store';
import { ProfileSyncService } from '../profile/profile-sync.service';

import { compressPhoto } from './photo';
import { MicUnavailableError, VoiceRecorder } from './recorder';
import { DeviceSpeech, type SpeechFailure } from './speech';

export interface Wallet {
  freeToday: number;
  welcome: number;
  packs: number;
  total: number;
  isPro: boolean;
  /** Qué acepta el servidor: texto ya transcrito en el dispositivo y/o audio (Whisper). */
  voice?: { transcript: boolean; audio: boolean };
}

interface AnalysisItemDto {
  name: string;
  displayName: string;
  grams: number;
  confidence: number;
  needsReview: boolean;
  food: Food | null;
  /** Unidades ("2 huevos"): sin quantity, solo gramos. grams = quantity × unitGrams. */
  quantity?: number;
  unitOne?: string;
  unitMany?: string;
  unitGrams?: number;
}

/** Lo analizado es una receta: los ítems son sus ingredientes con toda la cantidad. */
export interface RecipeInfo {
  name: string;
  /** Porciones que rinde; 0 = no se sabe. */
  servings: number;
}

interface AnalysisDto {
  id: string;
  items: AnalysisItemDto[];
  recipe?: RecipeInfo;
  /** Solo en voz: lo que se entendió del audio. */
  transcript?: string;
  noFood: boolean;
  fallback: boolean;
  credits: Wallet;
}

/** Un ítem del borrador: el usuario puede cambiar los gramos, el alimento o quitarlo. */
export interface DraftItem {
  key: number;
  displayName: string;
  food: Food | null;
  grams: number;
  needsReview: boolean;
  removed: boolean;
  /** Ya guardado: si falla un ítem posterior, el reintento no lo duplica. */
  saved: boolean;
  /** Unidades: cuántas y cuánto pesa una (0 = se cuenta en gramos). */
  quantity: number;
  unitOne: string;
  unitMany: string;
  unitGrams: number;
}

/**
 * Foto: idle → analyzing → review (confirmación, siempre) | noFood | error | noCredits.
 * Voz: idle → recording → analyzing → … (o micError si no hay permiso de micrófono).
 * La confirmación se muestra siempre: la IA erra ±20–25 % en gramos y su
 * "confianza" no predice el error (benchmark de noviembre de 2026).
 */
export type Phase =
  'idle' | 'recording' | 'micError' | 'analyzing' | 'review' | 'saving' | 'noFood' | 'error' | 'noCredits';

export type InputKind = 'photo' | 'voice';

interface AnalysisState {
  phase: Phase;
  /** De dónde sale el borrador: define los textos y el origen con que se guarda. */
  kind: InputKind;
  draft: DraftItem[];
  /** Si lo analizado es una receta: se guarda como plato propio y se anota la parte comida. */
  recipe: RecipeInfo | null;
  /** Parte de la receta que se comió (0 a 1]. */
  portion: number;
  wallet: Wallet | null;
  /** Para reintentar sin volver a sacar la foto ni grabar: la foto, el audio o el texto dictado. */
  lastInput: Blob | string | null;
  transcript: string;
  /**
   * Cómo se está capturando la voz: 'device' = reconocimiento del dispositivo (gratis,
   * texto en vivo); 'audio' = se graba y transcribe el servidor (respaldo, Groq).
   */
  capture: 'device' | 'audio';
}

const CLEARED: Pick<AnalysisState, 'phase' | 'draft' | 'lastInput' | 'transcript' | 'recipe' | 'portion'> = {
  phase: 'idle',
  draft: [],
  lastInput: null,
  transcript: '',
  recipe: null,
  portion: 1,
};

/** Porción inicial de una receta: una porción si se sabe cuántas rinde; si no, toda. */
export function initialPortion(recipe: RecipeInfo | null | undefined): number {
  return recipe && recipe.servings >= 2 ? 1 / recipe.servings : 1;
}

/** Idioma del reconocedor: el del teléfono si coincide con el de la app (es-AR, es-MX…). */
function speechLang(appLang: string): string {
  const nav = globalThis.navigator?.language ?? '';
  if (nav.toLowerCase().startsWith(appLang)) return nav;
  return appLang === 'en' ? 'en-US' : 'es-ES';
}

/** La IA a veces devuelve el nombre en minúsculas ("salsa chimichurri"). */
function capitalize(s: string): string {
  return s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s;
}

export const AnalysisStore = signalStore(
  { providedIn: 'root' },
  withState<AnalysisState>({ ...CLEARED, kind: 'photo', wallet: null, capture: 'device' }),
  withComputed(({ draft, recipe, portion }) => {
    const savable = computed(() => draft().filter((d) => !d.removed && !d.saved && d.food));
    /** Peso de toda la receta: la suma de los ingredientes que se guardan. */
    const recipeGrams = computed(() => savable().reduce((sum, d) => sum + d.grams, 0));
    return {
      kept: computed(() => draft().filter((d) => !d.removed)),
      /** Lo que se guardaría: solo los ítems con alimento elegido. */
      savable,
      recipeGrams,
      /** Calorías que se anotan: en una receta, solo la parte comida. */
      draftKcal: computed(() => {
        const all = draft()
          .filter((d) => !d.removed && d.food)
          .reduce((sum, d) => sum + ((d.food?.per100g.kcal ?? 0) * d.grams) / 100, 0);
        return recipe() ? all * portion() : all;
      }),
    };
  }),
  withMethods(
    (
      store,
      http = inject(HttpClient),
      api = inject(API_URL),
      auth = inject(AuthService),
      diary = inject(DiaryStore),
      sync = inject(ProfileSyncService),
      recorder = inject(VoiceRecorder),
      speech = inject(DeviceSpeech),
      transloco = inject(TranslocoService),
    ) => {
      /** El perfil todavía no llegó al servidor (409): se sube y se reintenta una vez. */
      async function withProfile<T>(call: () => Promise<T>): Promise<T> {
        await auth.ensureSession();
        try {
          return await call();
        } catch (err) {
          if (err instanceof HttpErrorResponse && err.status === 409 && (await sync.sync())) return call();
          throw err;
        }
      }

      async function post(kind: InputKind, input: Blob | string): Promise<AnalysisDto> {
        // Texto ya transcrito en el dispositivo: solo se extraen los alimentos.
        if (typeof input === 'string')
          return firstValueFrom(http.post<AnalysisDto>(`${api}/v1/me/analyses/text`, { text: input }));
        const form = new FormData();
        if (kind === 'photo') form.append('photo', await compressPhoto(input), 'plato.jpg');
        else form.append('audio', input, 'voz');
        return firstValueFrom(http.post<AnalysisDto>(`${api}/v1/me/analyses/${kind}`, form));
      }

      async function run(kind: InputKind, input: Blob | string): Promise<void> {
        patchState(store, { phase: 'analyzing', kind, draft: [], lastInput: input, transcript: '' });
        try {
          const res = await withProfile(() => post(kind, input));
          patchState(store, {
            wallet: res.credits,
            transcript: res.transcript ?? '',
            phase: res.noFood ? 'noFood' : 'review',
            recipe: res.recipe ?? null,
            portion: initialPortion(res.recipe),
            draft: res.items.map((it, i) => ({
              key: i,
              displayName: capitalize(it.displayName || it.name),
              food: it.food,
              grams: Math.round(it.grams),
              needsReview: it.needsReview,
              removed: false,
              saved: false,
              quantity: it.quantity ?? 0,
              unitOne: it.unitOne ?? '',
              unitMany: it.unitMany ?? it.unitOne ?? '',
              unitGrams: it.unitGrams ?? 0,
            })),
          });
        } catch (err) {
          const noCredits = err instanceof HttpErrorResponse && (err.status === 402 || err.status === 429);
          patchState(store, { phase: noCredits ? 'noCredits' : 'error' });
        }
      }

      function patchItem(key: number, patch: Partial<DraftItem>): void {
        patchState(store, { draft: store.draft().map((d) => (d.key === key ? { ...d, ...patch } : d)) });
      }

      return {
        async loadCredits(): Promise<void> {
          try {
            const wallet = await withProfile(() => firstValueFrom(http.get<Wallet>(`${api}/v1/me/credits`)));
            patchState(store, { wallet });
          } catch {
            /* los créditos se vuelven a pedir al próximo análisis */
          }
        },

        analyze(photo: Blob): Promise<void> {
          return run('photo', photo);
        },

        analyzeVoice(audio: Blob): Promise<void> {
          return run('voice', audio);
        },

        retry(): Promise<void> {
          const input = store.lastInput();
          if (input !== null) return run(store.kind(), input);
          // La voz falló antes de capturar algo: se vuelve a escuchar.
          return store.kind() === 'voice' ? this.startRecording() : Promise.resolve();
        },

        /** El micrófono se ofrece si el dispositivo transcribe o si el servidor tiene Whisper. */
        voiceAvailable(): boolean {
          const v = store.wallet()?.voice;
          return v === undefined || (speech.supported && v.transcript) || v.audio;
        },

        /**
         * Un toque en el micrófono empieza a escuchar (CLAUDE.md: ≤ 2 toques). Primero el
         * reconocimiento del dispositivo; si no hay o falla, se graba el audio para el servidor.
         */
        async startRecording(): Promise<void> {
          patchState(store, { ...CLEARED, phase: 'recording', kind: 'voice' });
          const v = store.wallet()?.voice;
          if (speech.supported && v?.transcript !== false) {
            patchState(store, { capture: 'device' });
            speech.start(
              speechLang(transloco.getActiveLang()),
              () => void this.finishRecording(),
              (f) => void this.onSpeechFailed(f),
            );
            return;
          }
          await this.recordAudio();
        },

        /** El dispositivo no pudo transcribir: sin permiso no hay nada que hacer; si no, respaldo. */
        async onSpeechFailed(f: SpeechFailure): Promise<void> {
          if (store.phase() !== 'recording' || store.capture() !== 'device') return;
          speech.cancel();
          if (f === 'denied') {
            patchState(store, { phase: 'micError' });
            return;
          }
          if (store.wallet()?.voice?.audio === false) {
            patchState(store, { phase: 'error' });
            return;
          }
          await this.recordAudio();
        },

        async recordAudio(): Promise<void> {
          patchState(store, { capture: 'audio' });
          try {
            await recorder.start(() => void this.finishRecording());
          } catch (err) {
            patchState(store, { phase: err instanceof MicUnavailableError ? 'micError' : 'error' });
          }
        },

        /** Termina de escuchar y analiza. Si no se entendió nada, no se envía (no cobra). */
        async finishRecording(): Promise<void> {
          if (store.phase() !== 'recording') return;
          if (store.capture() === 'device') {
            const text = await speech.stop();
            if (store.phase() !== 'recording') return; // se canceló mientras terminaba
            if (!text) {
              patchState(store, { ...CLEARED, phase: 'noFood' });
              return;
            }
            await run('voice', text);
            return;
          }
          const audio = await recorder.stop();
          if (audio.size === 0) {
            patchState(store, { ...CLEARED, phase: 'noFood' });
            return;
          }
          await run('voice', audio);
        },

        /**
         * Ajuste rápido: de a una unidad si se cuenta en unidades ("2 huevos" → 3), o
         * ±10 % de los gramos (el error típico de la IA es ±20–25 %). up = más.
         */
        nudge(key: number, up: boolean): void {
          const item = store.draft().find((d) => d.key === key);
          if (!item) return;
          if (item.quantity > 0 && item.unitGrams > 0) {
            // De a una; por debajo de una unidad, de a media ("media cucharada").
            const step = item.quantity > 1 || (up && item.quantity === 1) ? 1 : 0.5;
            const quantity = Math.min(200, Math.max(0.5, item.quantity + (up ? step : -step)));
            const grams = Math.min(3000, Math.max(1, Math.round(quantity * item.unitGrams)));
            patchItem(key, { quantity, grams });
            return;
          }
          const factor = up ? 1.1 : 0.9;
          patchItem(key, { grams: Math.min(3000, Math.max(5, Math.round((item.grams * factor) / 5) * 5)) });
        },
        /** Cuánto se comió de la receta (parte de toda). */
        setPortion(portion: number): void {
          patchState(store, { portion: Math.min(1, Math.max(0.01, portion)) });
        },
        setFood(key: number, food: Food): void {
          patchItem(key, { food, needsReview: false });
        },
        remove(key: number): void {
          patchItem(key, { removed: true });
        },
        undo(key: number): void {
          patchItem(key, { removed: false });
        },

        /**
         * Guarda los ítems confirmados con su origen ("photo" o "voice"). Una receta se
         * guarda como plato propio (con sus ingredientes) y se anota solo la parte comida.
         */
        async save(): Promise<boolean> {
          const items = store.savable();
          patchState(store, { phase: 'saving' });
          try {
            const recipe = store.recipe();
            if (recipe) {
              await firstValueFrom(
                http.post(`${api}/v1/me/recipes`, {
                  name: recipe.name,
                  servings: recipe.servings,
                  ingredients: items.map((it) => ({ foodId: it.food!.id, grams: it.grams })),
                  eatenGrams: Math.max(1, Math.round(store.recipeGrams() * store.portion())),
                  source: store.kind(),
                }),
              );
              await diary.load();
              patchState(store, CLEARED);
              return true;
            }
            for (const it of items) {
              await firstValueFrom(
                http.post(`${api}/v1/me/entries`, { foodId: it.food!.id, grams: it.grams, source: store.kind() }),
              );
              patchItem(it.key, { saved: true });
            }
            await diary.load();
            patchState(store, CLEARED);
            return true;
          } catch {
            patchState(store, { phase: 'review' });
            return false;
          }
        },

        close(): void {
          recorder.cancel();
          speech.cancel();
          patchState(store, CLEARED);
        },
      };
    },
  ),
);
