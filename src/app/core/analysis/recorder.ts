import { Injectable } from '@angular/core';

/** Corte automático: una comida se describe en segundos; 60 s acota el costo y el tamaño. */
export const MAX_RECORDING_MS = 60_000;

/** Formatos en orden de preferencia: Opus es el más liviano; iOS solo graba mp4. */
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

export class MicUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('micrófono no disponible', { cause });
  }
}

/**
 * Graba la voz con MediaRecorder. El audio vive solo en memoria: se sube para
 * analizarlo y se descarta (igual que las fotos).
 */
@Injectable({ providedIn: 'root' })
export class VoiceRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private limit: ReturnType<typeof setTimeout> | null = null;

  /** Pide el micrófono y empieza a grabar. onLimit se llama si se llega al máximo. */
  async start(onLimit: () => void): Promise<void> {
    this.cancel();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      throw new MicUnavailableError(err); // permiso denegado o sin micrófono
    }
    const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    recorder.start();
    this.recorder = recorder;
    this.limit = setTimeout(onLimit, MAX_RECORDING_MS);
  }

  get recording(): boolean {
    return this.recorder?.state === 'recording';
  }

  /** Termina la grabación y devuelve el audio. */
  stop(): Promise<Blob> {
    const recorder = this.recorder;
    if (!recorder) return Promise.resolve(new Blob());
    return new Promise((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' }));
        this.release();
      };
      recorder.stop();
    });
  }

  /** Descarta la grabación y libera el micrófono. */
  cancel(): void {
    if (this.recorder?.state === 'recording') {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.release();
  }

  private release(): void {
    if (this.limit) clearTimeout(this.limit);
    this.limit = null;
    this.recorder?.stream.getTracks().forEach((t) => t.stop()); // apaga el indicador de micrófono
    this.recorder = null;
    this.chunks = [];
  }
}
