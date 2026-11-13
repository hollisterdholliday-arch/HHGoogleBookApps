// Encodes the stage + mixed audio with Chrome's built-in hardware encoder
// and streams the file to disk as it records.

export interface Sink {
  write(chunk: Blob): Promise<void>;
  close(): Promise<SavedFile>;
  abort(): Promise<void>;
}

export interface SavedFile {
  name: string;
  where: string;
  open: () => Promise<string>;
}

const TYPES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm',
];

export function pickMimeType(): { mime: string; ext: 'mp4' | 'webm' } {
  for (const t of TYPES) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
      return { mime: t, ext: t.startsWith('video/mp4') ? 'mp4' : 'webm' };
    }
  }
  return { mime: '', ext: 'webm' };
}

export class Recording {
  private rec: MediaRecorder;
  private queue: Promise<void> = Promise.resolve();
  private stopped: Promise<void>;
  private startedAt = 0;
  private pausedAt = 0;
  private pausedTotal = 0;
  error: unknown = null;

  constructor(stream: MediaStream, mime: string, private sink: Sink) {
    this.rec = new MediaRecorder(stream, {
      mimeType: mime || undefined,
      videoBitsPerSecond: 8_000_000,
      audioBitsPerSecond: 160_000,
    });
    this.rec.ondataavailable = (e) => {
      if (e.data.size) this.queue = this.queue.then(() => this.sink.write(e.data)).catch((err) => void (this.error = err));
    };
    this.stopped = new Promise((res) => (this.rec.onstop = () => res()));
  }

  start(): void {
    this.startedAt = performance.now();
    this.rec.start(1000);
  }

  get paused(): boolean {
    return this.rec.state === 'paused';
  }

  pause(): void {
    if (this.rec.state === 'recording') {
      this.rec.pause();
      this.pausedAt = performance.now();
    }
  }

  resume(): void {
    if (this.rec.state === 'paused') {
      this.rec.resume();
      this.pausedTotal += performance.now() - this.pausedAt;
    }
  }

  /** Recorded seconds, not counting pauses. */
  elapsed(): number {
    if (!this.startedAt) return 0;
    const now = this.paused ? this.pausedAt : performance.now();
    return Math.max(0, (now - this.startedAt - this.pausedTotal) / 1000);
  }

  async stop(): Promise<SavedFile> {
    if (this.rec.state !== 'inactive') this.rec.stop();
    await this.stopped;
    await this.queue;
    if (this.error) {
      await this.sink.abort();
      throw this.error;
    }
    return this.sink.close();
  }
}
