// Draws the recorded stage: screen, camera, cards and text, with springy
// animated transitions between scenes. The same canvas is the live preview
// and the source of the recording, so what you see is what you get.

import { sceneById, type Box, type CardKind, type Layout } from './scenes';
import { CameraFx, type Crop } from './effects';
import { Slides } from './slides';
import { VideoSource, type Drawable } from './sources';

export const W = 1920;
export const H = 1080;
export const FPS = 30;
const FONT = '"Roboto Flex", "Google Sans", system-ui, sans-serif';
const TRANSITION_MS = 620;

export interface SceneText {
  title: string;
  name: string;
  role: string;
  problem: string;
  outro: string;
  brb: string;
}

interface PxBox {
  x: number;
  y: number;
  w: number;
  h: number;
  rad: number;
  o: number;
  ring: number;
  cut: number;
}
interface State {
  screen: PxBox;
  screen2: PxBox;
  tool: PxBox;
  camera: PxBox;
  cards: Record<CardKind, number>;
  title: number;
  lower: number;
}

const toPx = (b: Box): PxBox => {
  const w = b.w * W;
  const h = b.h * H;
  return { x: b.x * W, y: b.y * H, w, h, rad: b.circle ? Math.min(w, h) / 2 : b.r * W, o: b.o, ring: b.ring ? 1 : 0, cut: b.cutout ? 1 : 0 };
};
const toState = (l: Layout): State => ({
  screen: toPx(l.screen),
  screen2: toPx(l.screen2),
  tool: toPx(l.tool),
  camera: toPx(l.camera),
  cards: { problem: l.card === 'problem' ? 1 : 0, brb: l.card === 'brb' ? 1 : 0, outro: l.card === 'outro' ? 1 : 0 },
  title: l.title ? 1 : 0,
  lower: l.lower ? 1 : 0,
});
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpBox = (a: PxBox, b: PxBox, g: number, f: number): PxBox => ({
  x: lerp(a.x, b.x, g),
  y: lerp(a.y, b.y, g),
  w: Math.max(1, lerp(a.w, b.w, g)),
  h: Math.max(1, lerp(a.h, b.h, g)),
  rad: Math.max(0, lerp(a.rad, b.rad, g)),
  o: lerp(a.o, b.o, f),
  ring: lerp(a.ring, b.ring, f),
  cut: lerp(a.cut, b.cut, f),
});
// Springy "expressive" easing with a little overshoot.
const easeOutBack = (t: number) => {
  const c1 = 1.25;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function fit(sw: number, sh: number, b: PxBox, mode: 'cover' | 'contain') {
  const s = mode === 'cover' ? Math.max(b.w / sw, b.h / sh) : Math.min(b.w / sw, b.h / sh);
  const w = sw * s;
  const h = sh * s;
  return { x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, w, h };
}

export class Compositor {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private scratch = document.createElement('canvas');
  readonly screen = new VideoSource();
  readonly screen2 = new VideoSource();
  readonly tool = new VideoSource();
  readonly slides = new Slides();
  readonly camera = new VideoSource();
  readonly fx = new CameraFx();
  text: SceneText = { title: '', name: '', role: '', problem: '', outro: '', brb: '' };
  cameraOn = true;
  mirrorCamera = false;
  ambient: HTMLCanvasElement | null = null;

  private from: State;
  private to: State;
  private t0 = 0;
  private sceneId = 2;
  private sceneStart = performance.now();
  private worker: Worker | null = null;
  private frameNo = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.from = this.to = toState(sceneById(this.sceneId).layout);
  }

  get scene(): number {
    return this.sceneId;
  }

  setScene(id: number): void {
    if (id === this.sceneId) return;
    const now = performance.now();
    this.from = this.stateAt(now);
    this.to = toState(sceneById(id).layout);
    this.t0 = now;
    this.sceneId = id;
    this.sceneStart = now;
  }

  start(): void {
    if (this.worker) return;
    this.worker = new Worker(new URL('./ticker.worker.ts', import.meta.url), { type: 'module' });
    // Drop ticks that waited in line (the page was busy) instead of
    // drawing a backlog, which would freeze a slow computer.
    this.worker.onmessage = (e: MessageEvent<number>) => {
      if (Date.now() - e.data < 1000 / FPS) this.draw(performance.now());
    };
    this.worker.postMessage({ fps: FPS });
  }

  stop(): void {
    this.worker?.postMessage('stop');
    this.worker?.terminate();
    this.worker = null;
  }

  captureStream(): MediaStream {
    return this.canvas.captureStream(FPS);
  }

  private stateAt(now: number): State {
    const t = Math.min(1, (now - this.t0) / TRANSITION_MS);
    if (t >= 1) return this.to;
    const g = easeOutBack(t);
    const f = easeOutCubic(t);
    const a = this.from;
    const b = this.to;
    return {
      screen: lerpBox(a.screen, b.screen, g, f),
      screen2: lerpBox(a.screen2, b.screen2, g, f),
      tool: lerpBox(a.tool, b.tool, g, f),
      camera: lerpBox(a.camera, b.camera, g, f),
      cards: {
        problem: lerp(a.cards.problem, b.cards.problem, f),
        brb: lerp(a.cards.brb, b.cards.brb, f),
        outro: lerp(a.cards.outro, b.cards.outro, f),
      },
      title: lerp(a.title, b.title, f),
      lower: lerp(a.lower, b.lower, f),
    };
  }

  draw(now: number): void {
    const ctx = this.ctx;
    const s = this.stateAt(now);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0d0d10';
    ctx.fillRect(0, 0, W, H);

    if (s.screen.o > 0.01) this.drawBox(s.screen, (b) => this.drawScreen(b));
    if (s.screen2.o > 0.01) this.drawBox(s.screen2, (b) => this.drawSource(b, this.screen2.current(), 'Share a second window', 'Use Sources › Second screen'));
    if (s.tool.o > 0.01) this.drawBox(s.tool, (b) => this.drawSource(b, this.tool.current(), 'Open a teaching tool', 'Content › Teaching tools'));
    (['problem', 'brb', 'outro'] as CardKind[]).forEach((k) => {
      if (s.cards[k] > 0.01) this.drawCard(k, s.cards[k], now);
    });
    if (s.camera.o > 0.01) {
      // Presenter-style cutouts float over the scene with no frame.
      if (this.to.camera.cut > 0.5) this.drawCutout(s.camera, now);
      else this.drawBox(s.camera, (b) => this.drawCamera(b, now), this.fx.settings.bg === 'remove');
    }
    if (s.title > 0.01) this.drawTitle(s.title);
    if (s.lower > 0.01) this.drawLower(s.lower);

    this.frameNo++;
    if (this.ambient && this.frameNo % 4 === 0) {
      const a = this.ambient.getContext('2d');
      a?.drawImage(this.canvas, 0, 0, this.ambient.width, this.ambient.height);
    }
  }

  // ---------- boxes ----------

  private path(b: PxBox): void {
    const ctx = this.ctx;
    ctx.beginPath();
    if (b.rad >= Math.min(b.w, b.h) / 2 - 0.5) {
      ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
    } else {
      ctx.roundRect(b.x, b.y, b.w, b.h, b.rad);
    }
  }

  private drawBox(b: PxBox, content: (b: PxBox) => void, transparent = false): void {
    const ctx = this.ctx;
    const fullScreen = b.w >= W - 1 && b.h >= H - 1;
    ctx.save();
    ctx.globalAlpha = b.o;
    if (!fullScreen && !transparent) {
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 48;
      ctx.shadowOffsetY = 16;
      this.path(b);
      ctx.fillStyle = '#111114';
      ctx.fill();
      ctx.shadowColor = 'transparent';
    }
    this.path(b);
    ctx.clip();
    content(b);
    ctx.restore();
    if (b.ring > 0.01) {
      ctx.save();
      ctx.globalAlpha = b.o * b.ring;
      this.path(b);
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawScreen(b: PxBox): void {
    const sl = this.slides;
    const f = sl.active ? { img: sl.canvas, w: sl.canvas.width, h: sl.canvas.height } : this.screen.current();
    this.drawSource(b, f, 'Share your screen', 'Pick a tab, a window or your whole screen');
  }

  private drawSource(b: PxBox, f: { img: CanvasImageSource; w: number; h: number } | null, title: string, hint: string): void {
    const ctx = this.ctx;
    if (f && f.w) {
      ctx.fillStyle = '#0b0b0e';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      const r = fit(f.w, f.h, b, 'contain');
      ctx.drawImage(f.img, r.x, r.y, r.w, r.h);
      return;
    }
    const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
    g.addColorStop(0, '#1e2140');
    g.addColorStop(1, '#2d3166');
    ctx.fillStyle = g;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    const k = b.w / W;
    ctx.fillStyle = '#dee0ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(72 * k)}px ${FONT}`;
    ctx.fillText(title, b.x + b.w / 2, b.y + b.h / 2 - 34 * k);
    ctx.fillStyle = 'rgba(222,224,255,0.75)';
    ctx.font = `500 ${Math.round(34 * k)}px ${FONT}`;
    ctx.fillText(hint, b.x + b.w / 2, b.y + b.h / 2 + 44 * k);
  }

  /** Camera image (with effects), cropped to cover box `b`. */
  private paintCamera(b: PxBox, now: number, forceRemove: boolean, anchorBottom = false): boolean {
    const ctx = this.ctx;
    const raw = this.cameraOn ? this.camera.current() : null;
    if (!raw) return false;
    const f = this.fx.process(raw.img as Drawable, raw.w, raw.h, now, forceRemove);
    const src: Crop = f.crop ?? { sx: 0, sy: 0, sw: f.w, sh: f.h };
    const boxAspect = b.w / b.h;
    let sw = src.sw;
    let sh = src.sh;
    if (sw / sh > boxAspect) sw = sh * boxAspect;
    else sh = sw / boxAspect;
    const sx = src.sx + (src.sw - sw) / 2;
    const sy = anchorBottom ? src.sy + src.sh - sh : src.sy + (src.sh - sh) / 2;
    ctx.save();
    if (this.fx.settings.lightFix) ctx.filter = 'brightness(1.12) saturate(1.08) contrast(1.03)';
    if (this.mirrorCamera) {
      ctx.translate(b.x * 2 + b.w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(f.img, sx, sy, sw, sh, b.x, b.y, b.w, b.h);
    ctx.restore();
    return true;
  }

  private drawCutout(b: PxBox, now: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = b.o;
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 10;
    const ok = this.paintCamera(b, now, true, true);
    ctx.restore();
    if (!ok) this.drawBox({ ...b, rad: 32 }, (bb) => this.drawCamera(bb, now));
  }

  private drawCamera(b: PxBox, now: number): void {
    const ctx = this.ctx;
    if (this.paintCamera(b, now, false)) return;
    const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
    g.addColorStop(0, '#4b3d35');
    g.addColorStop(1, '#241d1a');
    ctx.fillStyle = g;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    const d = Math.min(b.w, b.h) * 0.42;
    ctx.fillStyle = '#bac3ff';
    ctx.beginPath();
    ctx.arc(b.x + b.w / 2, b.y + b.h / 2, d / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#212c61';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(d * 0.42)}px ${FONT}`;
    ctx.fillText(initials(this.text.name), b.x + b.w / 2, b.y + b.h / 2 + d * 0.02);
  }

  // ---------- cards ----------

  private drawCard(kind: CardKind, a: number, now: number): void {
    const ctx = this.ctx;
    const t = this.text;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    if (kind === 'problem') {
      ctx.fillStyle = '#fff1e6';
      ctx.fillRect(0, 0, W, H);
      const x = W * 0.08;
      ctx.fillStyle = '#7a2e00';
      ctx.font = `750 34px ${FONT}`;
      ctx.fillText(spaced('PAUSE THE VIDEO'), x, 300);
      ctx.fillStyle = '#2b1300';
      ctx.font = `850 120px ${FONT}`;
      ctx.fillText('Try this one', x, 420);
      ctx.font = `750 92px ${FONT}`;
      const pw = Math.min(W * 0.55, ctx.measureText(t.problem || ' ').width + 120);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(122,46,0,0.14)';
      ctx.shadowBlur = 40;
      ctx.beginPath();
      ctx.roundRect(x, 500, pw, 170, 46);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#1b1b21';
      ctx.fillText(clip(ctx, t.problem, pw - 120), x + 60, 620);
      // Live one-minute timer that starts when the scene appears.
      const left = Math.max(0, 60 - Math.floor((now - this.sceneStart) / 1000));
      const cx = x + pw + 170;
      const cy = 585;
      ctx.lineWidth = 22;
      ctx.strokeStyle = 'rgba(242,155,82,0.3)';
      ctx.beginPath();
      ctx.arc(cx, cy, 100, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#f29b52';
      ctx.beginPath();
      ctx.arc(cx, cy, 100, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * left) / 60);
      ctx.stroke();
      ctx.fillStyle = '#2b1300';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 54px ${FONT}`;
      ctx.fillText(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, cx, cy + 2);
    } else if (kind === 'brb') {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#4a55a8');
      g.addColorStop(1, '#212c61');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = `850 132px ${FONT}`;
      ctx.fillText('Be right back', W / 2, H / 2 + 10);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `500 46px ${FONT}`;
      ctx.fillText(clip(ctx, t.brb, W * 0.8), W / 2, H / 2 + 100);
    } else {
      ctx.fillStyle = '#20233f';
      ctx.fillRect(0, 0, W, H);
      const x = W * 0.46;
      ctx.fillStyle = '#bac3ff';
      ctx.font = `750 34px ${FONT}`;
      ctx.fillText(spaced("THAT'S A WRAP"), x, 380);
      ctx.fillStyle = '#ffffff';
      ctx.font = `850 92px ${FONT}`;
      const lines = wrap(ctx, t.outro, W * 0.48).slice(0, 3);
      lines.forEach((ln, i) => ctx.fillText(ln, x, 490 + i * 100));
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `500 40px ${FONT}`;
      ctx.fillText(clip(ctx, `See you next class · ${t.name}`, W * 0.48), x, 520 + lines.length * 100);
    }
    ctx.restore();
  }

  // ---------- overlays ----------

  private drawTitle(a: number): void {
    const ctx = this.ctx;
    const t = this.text;
    ctx.save();
    ctx.globalAlpha = a;
    const g = ctx.createLinearGradient(0, H * 0.35, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const lift = (1 - a) * 50;
    const x = W * 0.06;
    ctx.font = `850 108px ${FONT}`;
    const lines = wrap(ctx, t.title, W * 0.62).slice(0, 2);
    const bottom = H * 0.88 + lift;
    const subY = bottom;
    const titleY = subY - 70 - (lines.length - 1) * 112;
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.font = `700 32px ${FONT}`;
    ctx.fillText(spaced(t.role.split('·')[0].trim().toUpperCase()), x, titleY - 110);
    ctx.fillStyle = '#ffffff';
    ctx.font = `850 108px ${FONT}`;
    lines.forEach((ln, i) => ctx.fillText(ln, x, titleY + i * 112));
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `500 40px ${FONT}`;
    ctx.fillText(`with ${t.name}`, x, subY);
    ctx.restore();
  }

  private drawLower(a: number): void {
    const ctx = this.ctx;
    const t = this.text;
    ctx.save();
    ctx.font = `750 46px ${FONT}`;
    const nameW = ctx.measureText(t.name).width;
    ctx.font = `500 29px ${FONT}`;
    const roleW = ctx.measureText(t.role).width;
    const w = Math.min(W * 0.7, Math.max(nameW, roleW) + 120);
    const h = 130;
    const x = W * 0.04 - (1 - a) * 80;
    const y = H - H * 0.07 - h;

    // Frosted glass: blur what is behind the bar.
    const sc = this.scratch;
    sc.width = Math.ceil(w);
    sc.height = h;
    const sctx = sc.getContext('2d')!;
    sctx.drawImage(this.canvas, x, y, w, h, 0, 0, w, h);
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 38);
    ctx.clip();
    ctx.filter = 'blur(22px)';
    ctx.drawImage(sc, x - 20, y - 20, w + 40, h + 40);
    ctx.filter = 'none';
    ctx.fillStyle = 'rgba(20,22,40,0.55)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#bac3ff';
    ctx.beginPath();
    ctx.roundRect(x + 28, y + 26, 13, h - 52, 7);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff';
    ctx.font = `750 46px ${FONT}`;
    ctx.fillText(t.name, x + 66, y + 66);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `500 29px ${FONT}`;
    ctx.fillText(t.role, x + 66, y + 104);
    ctx.restore();
  }
}

function initials(name: string): string {
  const words = name.replace(/^(mr|mrs|ms|mx|dr)\.?\s+/i, '').split(/\s+/).filter(Boolean);
  return (words.map((w) => w[0]).join('').slice(0, 2) || '?').toUpperCase();
}

function spaced(s: string): string {
  return s.split('').join(' ');
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = (text || '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

function clip(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s}…`;
}
