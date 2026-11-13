// Live captions while you record, using Chrome's built-in on-device speech
// recognition (no extra libraries, and audio never leaves the computer).
// Captions are saved as .vtt and .srt files next to the video.

/* eslint-disable @typescript-eslint/no-explicit-any */
type SRClass = any;
const SR = (): SRClass | undefined => (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

export interface Cue {
  start: number;
  end: number;
  text: string;
}

export type CaptionAvailability = 'ready' | 'downloadable' | 'unavailable';

/** Whether on-device recognition for `lang` is ready, can be downloaded, or isn't possible. */
export async function captionAvailability(lang: string): Promise<CaptionAvailability> {
  const C = SR();
  if (!C?.available) return 'unavailable';
  try {
    const a = await C.available({ langs: [lang], processLocally: true });
    return a === 'available' ? 'ready' : a === 'downloadable' || a === 'downloading' ? 'downloadable' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export async function installCaptions(lang: string): Promise<boolean> {
  const C = SR();
  try {
    return !!(await C?.install?.({ langs: [lang], processLocally: true }));
  } catch {
    return false;
  }
}

export class LiveCaptions {
  cues: Cue[] = [];
  private rec: any = null;
  private running = false;
  private speechStart: number | null = null;

  constructor(
    private elapsed: () => number,
    private isPaused: () => boolean,
    private lang = 'en-US',
  ) {}

  start(): void {
    const C = SR();
    if (!C) return;
    this.running = true;
    const rec = new C();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = false;
    rec.processLocally = true;
    rec.onspeechstart = () => (this.speechStart = this.elapsed());
    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r.isFinal || this.isPaused()) continue;
        const text = String(r[0]?.transcript ?? '').trim();
        if (!text) continue;
        const end = this.elapsed();
        const prevEnd = this.cues.at(-1)?.end ?? 0;
        const guess = end - Math.min(8, Math.max(1, text.split(/\s+/).length * 0.38));
        const start = Math.max(prevEnd, Math.min(end - 0.5, this.speechStart ?? guess));
        // Split long results into caption-sized pieces.
        const words = text.split(/\s+/);
        const chunks: string[] = [];
        for (let j = 0; j < words.length; j += 10) chunks.push(words.slice(j, j + 10).join(' '));
        const step = (end - start) / chunks.length;
        chunks.forEach((c, k) => this.cues.push({ start: start + k * step, end: start + (k + 1) * step, text: c }));
        this.speechStart = null;
      }
    };
    // Recognition sessions end on their own every so often; keep it going.
    rec.onend = () => {
      if (this.running) {
        try {
          rec.start();
        } catch {
          /* already restarting */
        }
      }
    };
    rec.onerror = () => {};
    this.rec = rec;
    try {
      rec.start();
    } catch {
      this.running = false;
    }
  }

  stop(): Cue[] {
    this.running = false;
    try {
      this.rec?.stop();
    } catch {
      /* not started */
    }
    this.rec = null;
    return this.cues;
  }
}

const stamp = (s: number, sep: '.' | ',') => {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const sec = Math.floor((ms % 60_000) / 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(sec)}${sep}${p(ms % 1000, 3)}`;
};

export const toVtt = (cues: Cue[]) => `WEBVTT\n\n${cues.map((c) => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.text}`).join('\n\n')}\n`;
export const toSrt = (cues: Cue[]) => cues.map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.text}`).join('\n\n') + '\n';

export function parseVtt(text: string): Cue[] {
  const toSec = (t: string) => {
    const [h, m, s] = t.replace(',', '.').split(':');
    return Number(h) * 3600 + Number(m) * 60 + Number(s);
  };
  const cues: Cue[] = [];
  for (const block of text.split(/\n\n+/)) {
    const m = block.match(/(\d+:\d+:\d+[.,]\d+)\s*-->\s*(\d+:\d+:\d+[.,]\d+)\n([\s\S]+)/);
    if (m) cues.push({ start: toSec(m[1]), end: toSec(m[2]), text: m[3].trim() });
  }
  return cues;
}
