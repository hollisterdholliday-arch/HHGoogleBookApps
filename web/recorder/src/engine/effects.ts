// Camera effects: background blur / replace / remove, auto-framing.
//
// Uses Google's MediaPipe selfie segmenter (Apache-2.0), running on this
// computer. The ~15 MB runtime only loads the first time an effect is on.

import type { ImageSegmenter } from '@mediapipe/tasks-vision';
import type { Drawable } from './sources';

export type BgMode = 'none' | 'blur' | 'replace' | 'remove';
export type BgPreset = 'indigo' | 'sunset' | 'slate' | 'image';

export interface FxSettings {
  bg: BgMode;
  preset: BgPreset;
  autoFrame: boolean;
  lightFix: boolean;
}

export const DEFAULT_FX: FxSettings = { bg: 'none', preset: 'indigo', autoFrame: false, lightFix: false };

export interface Crop {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface FxFrame {
  img: CanvasImageSource;
  w: number;
  h: number;
  crop: Crop | null;
}

const MAX_W = 1280;

export class CameraFx {
  settings: FxSettings = { ...DEFAULT_FX };
  bgImage: ImageBitmap | null = null;
  status: 'off' | 'loading' | 'ready' | 'failed' = 'off';
  onStatus: () => void = () => {};

  private seg: ImageSegmenter | null = null;
  private loading: Promise<void> | null = null;
  private mask = document.createElement('canvas');
  private maskCtx = this.mask.getContext('2d', { willReadFrequently: false })!;
  private maskData: ImageData | null = null;
  private person = document.createElement('canvas');
  private personCtx = this.person.getContext('2d')!;
  private out = document.createElement('canvas');
  private outCtx = this.out.getContext('2d')!;
  private lastSeg = 0;
  private lastTs = 0;
  private interval = 1000 / 20;
  private haveMask = false;
  /** Milliseconds the last segmentation took (for diagnostics). */
  lastCost = 0;
  // Smoothed auto-frame box, in 0..1 of the source.
  private frame = { cx: 0.5, top: 0, h: 1 };
  private personBox: { cx: number; top: number; h: number } | null = null;

  private needsSegmentation(forceRemove: boolean): boolean {
    return forceRemove || this.settings.bg !== 'none' || this.settings.autoFrame;
  }

  private ensure(): void {
    if (this.seg || this.loading || this.status === 'failed') return;
    this.status = 'loading';
    this.onStatus();
    this.loading = (async () => {
      try {
        const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
        const base = new URL('./', document.baseURI).href;
        const files = await FilesetResolver.forVisionTasks(`${base}mediapipe`);
        const make = (delegate: 'GPU' | 'CPU') =>
          ImageSegmenter.createFromOptions(files, {
            baseOptions: { modelAssetPath: `${base}models/selfie_segmenter.tflite`, delegate },
            runningMode: 'VIDEO',
            outputConfidenceMasks: true,
            outputCategoryMask: false,
          });
        this.seg = await make('GPU').catch(() => make('CPU'));
        this.status = 'ready';
      } catch (e) {
        console.warn('Camera effects unavailable', e);
        this.status = 'failed';
      }
      this.loading = null;
      this.onStatus();
    })();
  }

  private segment(img: Drawable, now: number): void {
    if (!this.seg || now - this.lastSeg < this.interval) return;
    this.lastSeg = now;
    const ts = Math.max(now, this.lastTs + 1);
    this.lastTs = ts;
    const t0 = performance.now();
    try {
      this.seg.segmentForVideo(img as HTMLVideoElement, ts, (res) => {
        const m = res.confidenceMasks?.[0];
        if (!m) return;
        const w = m.width;
        const h = m.height;
        const conf = m.getAsFloat32Array();
        if (this.mask.width !== w || this.mask.height !== h || !this.maskData) {
          this.mask.width = w;
          this.mask.height = h;
          this.maskData = this.maskCtx.createImageData(w, h);
        }
        const d = this.maskData.data;
        let minX = w, maxX = -1, minY = h, maxY = -1;
        for (let i = 0, p = 0; i < conf.length; i++, p += 4) {
          // Soft threshold keeps hair edges smooth.
          const c = conf[i];
          const a = c <= 0.25 ? 0 : c >= 0.75 ? 255 : ((c - 0.25) / 0.5) * 255;
          d[p] = d[p + 1] = d[p + 2] = 255;
          d[p + 3] = a;
          if (c > 0.6) {
            const x = i % w;
            const y = (i / w) | 0;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
        this.maskCtx.putImageData(this.maskData, 0, 0);
        this.haveMask = true;
        this.personBox = maxX > minX && maxY > minY ? { cx: (minX + maxX) / 2 / w, top: minY / h, h: (maxY - minY) / h } : null;
        m.close();
      });
    } catch {
      /* a dropped frame is fine */
    }
    // Slow computer? Segment less often so recording stays smooth.
    const took = performance.now() - t0;
    this.interval = took > 60 ? took * 4 : took > 30 ? 1000 / 10 : took > 18 ? 1000 / 15 : 1000 / 20;
    this.lastCost = took;
  }

  private updateFrame(): void {
    const p = this.personBox;
    const target = this.settings.autoFrame && p ? { cx: p.cx, top: Math.max(0, p.top - 0.08), h: Math.min(1, Math.max(0.55, 1 - p.top + 0.08)) } : { cx: 0.5, top: 0, h: 1 };
    const k = 0.06;
    this.frame.cx += (target.cx - this.frame.cx) * k;
    this.frame.top += (target.top - this.frame.top) * k;
    this.frame.h += (target.h - this.frame.h) * k;
  }

  private crop(w: number, h: number): Crop | null {
    if (!this.settings.autoFrame && this.frame.h > 0.995) return null;
    const sh = this.frame.h * h;
    const sw = Math.min(w, sh * (w / h));
    const sx = Math.min(w - sw, Math.max(0, this.frame.cx * w - sw / 2));
    const sy = Math.min(h - sh, Math.max(0, this.frame.top * h));
    return { sx, sy, sw, sh };
  }

  /** Returns the camera image with effects applied (or the raw frame). */
  process(img: Drawable, w: number, h: number, now: number, forceRemove = false): FxFrame {
    if (!this.needsSegmentation(forceRemove)) {
      this.haveMask = false;
      return { img, w, h, crop: null };
    }
    this.ensure();
    this.segment(img, now);
    this.updateFrame();
    const crop = this.crop(w, h);
    const mode: BgMode = forceRemove ? 'remove' : this.settings.bg;
    if (mode === 'none' || !this.haveMask) return { img, w, h, crop };

    const s = Math.min(1, MAX_W / w);
    const ow = Math.round(w * s);
    const oh = Math.round(h * s);
    for (const c of [this.person, this.out]) {
      if (c.width !== ow || c.height !== oh) {
        c.width = ow;
        c.height = oh;
      }
    }
    // Person only: camera image, kept where the mask says "person".
    const pc = this.personCtx;
    pc.globalCompositeOperation = 'source-over';
    pc.clearRect(0, 0, ow, oh);
    pc.drawImage(img, 0, 0, ow, oh);
    pc.globalCompositeOperation = 'destination-in';
    pc.filter = 'blur(2px)';
    pc.drawImage(this.mask, 0, 0, ow, oh);
    pc.filter = 'none';
    pc.globalCompositeOperation = 'source-over';

    const oc = this.outCtx;
    oc.clearRect(0, 0, ow, oh);
    if (mode === 'blur') {
      oc.filter = 'blur(18px)';
      oc.drawImage(img, -24, -24, ow + 48, oh + 48);
      oc.filter = 'none';
    } else if (mode === 'replace') {
      this.paintBackground(oc, ow, oh);
    }
    oc.drawImage(this.person, 0, 0);
    const k = ow / w;
    return { img: this.out, w: ow, h: oh, crop: crop ? { sx: crop.sx * k, sy: crop.sy * k, sw: crop.sw * k, sh: crop.sh * k } : null };
  }

  private paintBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const p = this.settings.preset;
    if (p === 'image' && this.bgImage) {
      const b = this.bgImage;
      const s = Math.max(w / b.width, h / b.height);
      ctx.drawImage(b, (w - b.width * s) / 2, (h - b.height * s) / 2, b.width * s, b.height * s);
      return;
    }
    const g = ctx.createLinearGradient(0, 0, w, h);
    const stops: Record<string, [string, string]> = {
      indigo: ['#4a55a8', '#1a1d45'],
      sunset: ['#f6c08a', '#c45b6a'],
      slate: ['#3a3d4a', '#1b1b21'],
      image: ['#4a55a8', '#1a1d45'],
    };
    const [a, b] = stops[p];
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}
