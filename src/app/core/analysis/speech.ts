import { Injectable, signal } from '@angular/core';

/** Lo mínimo de la Web Speech API que usamos (los tipos no vienen en lib.dom). */
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechCtor = new () => SpeechRecognitionLike;

/** Por qué el dispositivo no pudo transcribir. */
export type SpeechFailure = 'denied' | 'unavailable';

function ctor(): SpeechCtor | null {
  const w = globalThis as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Reconocimiento de voz del dispositivo (navegador; en la app nativa, el plugin de
 * Capacitor con la misma interfaz). Es gratis y muestra el texto mientras se habla:
 * es la vía principal del registro por voz. Si falla, la app graba el audio y lo
 * transcribe el servidor (Whisper en Groq, de respaldo).
 *
 * Privacidad: en Chrome el audio lo procesa Google; en Safari, Apple (puede ser en el
 * propio dispositivo). La app nunca guarda el audio.
 */
@Injectable({ providedIn: 'root' })
export class DeviceSpeech {
  /** Lo entendido hasta ahora (lo definitivo más lo provisional), para mostrarlo en vivo. */
  readonly text = signal('');

  private rec: SpeechRecognitionLike | null = null;
  private finals = '';
  private ended: Promise<void> = Promise.resolve();

  get supported(): boolean {
    return ctor() !== null;
  }

  /**
   * Empieza a escuchar. onEnd: el reconocedor terminó solo (silencio o tope del
   * navegador). onFail: no pudo seguir; con 'denied' falta el permiso del micrófono.
   */
  start(lang: string, onEnd: () => void, onFail: (f: SpeechFailure) => void): void {
    this.cancel();
    const Ctor = ctor();
    if (!Ctor) {
      onFail('unavailable');
      return;
    }
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    this.finals = '';
    this.text.set('');
    let failed = false;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) this.finals += r[0].transcript + ' ';
        else interim += r[0].transcript;
      }
      this.text.set((this.finals + interim).trim());
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return; // silencio: termina con texto vacío
      failed = true;
      onFail(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : 'unavailable');
    };
    this.ended = new Promise((resolve) => {
      rec.onend = () => {
        resolve();
        if (this.rec === rec && !failed) onEnd();
      };
    });
    this.rec = rec;
    rec.start();
  }

  /** Deja de escuchar y devuelve el texto final. */
  async stop(): Promise<string> {
    const rec = this.rec;
    if (rec) {
      this.rec = null;
      rec.stop();
      await this.ended;
    }
    return this.text().trim();
  }

  /** Descarta lo escuchado. */
  cancel(): void {
    const rec = this.rec;
    this.rec = null;
    rec?.abort();
    this.text.set('');
  }
}
