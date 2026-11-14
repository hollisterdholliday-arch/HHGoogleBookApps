// Custom scenes made in the scene builder: a background plus layers
// (camera, screen, slides, tools, text, images, video loops, shapes, timer).
// Saved in localStorage; pictures and videos are kept in IndexedDB.

import { idbGet, idbSet } from '../lib/idb';

export type Shape = 'rect' | 'rounded' | 'circle' | 'pill' | 'cookie' | 'clover' | 'burst' | 'arch';
export type LayerType = 'camera' | 'screen' | 'screen2' | 'tool' | 'text' | 'image' | 'clip' | 'shape' | 'timer';

export interface Layer {
  id: string;
  type: LayerType;
  name: string;
  /** Position and size, 0..1 of the stage. */
  x: number;
  y: number;
  w: number;
  h: number;
  shape: Shape;
  /** Corner roundness for 'rounded', 0..1 of the shorter side's half. */
  round: number;
  border: number; // px at 1080p
  borderColor: string;
  shadow: boolean;
  opacity: number; // 0..1
  hidden?: boolean;
  /** Camera: cut the person out (background removed). */
  cutout?: boolean;
  text?: string;
  fontSize?: number; // px at 1080p
  weight?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  pill?: boolean;
  fill?: string;
  /** Image or video clip, stored in IndexedDB under this key. */
  media?: string;
}

export type Background =
  | { kind: 'color'; value: string }
  | { kind: 'gradient'; from: string; to: string }
  | { kind: 'aurora' }
  | { kind: 'video'; media: string };

export interface CustomScene {
  id: number; // 100+
  name: string;
  bg: Background;
  layers: Layer[];
}

export const SHAPES: { id: Shape; label: string }[] = [
  { id: 'rect', label: 'Square' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'circle', label: 'Circle' },
  { id: 'pill', label: 'Pill' },
  { id: 'cookie', label: 'Cookie' },
  { id: 'clover', label: 'Clover' },
  { id: 'burst', label: 'Burst' },
  { id: 'arch', label: 'Arch' },
];

const polar = (fn: (t: number) => number, n = 96): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    const r = fn(t);
    return [0.5 + 0.5 * r * Math.cos(t), 0.5 + 0.5 * r * Math.sin(t)];
  });
const arch = (): [number, number][] => {
  const pts: [number, number][] = [
    [0, 1],
    [0, 0.5],
  ];
  for (let i = 0; i <= 40; i++) {
    const t = Math.PI + (i / 40) * Math.PI;
    pts.push([0.5 + 0.5 * Math.cos(t), 0.5 + 0.5 * Math.sin(t)]);
  }
  pts.push([1, 1]);
  return pts;
};

/** Material 3 Expressive-style shapes as outlines in a 0..1 box. */
export const SHAPE_POINTS: Partial<Record<Shape, [number, number][]>> = {
  cookie: polar((t) => 0.93 + 0.07 * Math.cos(12 * t)),
  clover: polar((t) => 0.78 + 0.22 * Math.cos(4 * t)),
  burst: polar((t) => 0.86 + 0.14 * Math.cos(8 * t)),
  arch: arch(),
};

/** CSS clip-path for thumbnails and the builder's shape picker. */
export function cssClip(shape: Shape, round = 0.2): string {
  const pts = SHAPE_POINTS[shape];
  if (pts) return `polygon(${pts.map(([x, y]) => `${(x * 100).toFixed(1)}% ${(y * 100).toFixed(1)}%`).join(',')})`;
  if (shape === 'circle') return 'ellipse(50% 50% at 50% 50%)';
  if (shape === 'pill') return 'inset(0 round 999px)';
  if (shape === 'rounded') return `inset(0 round ${Math.round(round * 40)}%)`;
  return 'inset(0)';
}

let seq = 0;
const lid = () => `L${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Height that keeps a natural shape for the layer type (16:9 stage). */
const H = (w: number, aspect: number) => (w * 16) / 9 / aspect;

export function newLayer(type: LayerType): Layer {
  const base: Layer = { id: lid(), type, name: type, x: 0.1, y: 0.1, w: 0.3, h: 0.3, shape: 'rounded', round: 0.2, border: 0, borderColor: '#ffffff', shadow: true, opacity: 1 };
  switch (type) {
    case 'camera':
      return { ...base, name: 'Camera', x: 0.62, y: 0.2, w: 0.28, h: H(0.28, 1), shape: 'circle', border: 6 };
    case 'screen':
      return { ...base, name: 'Screen', x: 0.06, y: 0.12, w: 0.56, h: 0.56 };
    case 'screen2':
      return { ...base, name: 'Second screen', x: 0.38, y: 0.12, w: 0.56, h: 0.56 };
    case 'tool':
      return { ...base, name: 'Teaching tool', x: 0.06, y: 0.12, w: 0.56, h: 0.56 };
    case 'text':
      return { ...base, name: 'Text', x: 0.08, y: 0.42, w: 0.6, h: 0.12, text: '', fontSize: 72, weight: 800, color: '#ffffff', align: 'left', shadow: false };
    case 'image':
      return { ...base, name: 'Image', x: 0.42, y: 0.36, w: 0.16, h: H(0.16, 1), fill: '#ffd8a8' };
    case 'clip':
      return { ...base, name: 'Video loop', x: 0.3, y: 0.25, w: 0.4, h: 0.4 };
    case 'shape':
      return { ...base, name: 'Shape', x: 0.35, y: 0.45, w: 0.3, h: H(0.3, 4), shape: 'pill', fill: '#4a55a8', shadow: false };
    case 'timer':
      return { ...base, name: 'Timer', x: 0.43, y: 0.35, w: 0.14, h: H(0.14, 1), shape: 'circle', fill: '#fff1e6' };
  }
}

export function templates(): { name: string; make: () => Omit<CustomScene, 'id'> }[] {
  return [
    {
      name: 'Blank',
      make: () => ({ name: '', bg: { kind: 'gradient', from: '#4a55a8', to: '#1a1d45' }, layers: [] }),
    },
    {
      name: 'Float over the loop',
      make: () => ({
        name: 'Float over the loop',
        bg: { kind: 'aurora' },
        layers: [
          { ...newLayer('text'), name: 'Big word (behind me)', x: 0.44, y: 0.06, w: 0.56, h: 0.24, text: '{title}', fontSize: 210, weight: 900, color: 'rgba(255,255,255,0.22)' },
          { ...newLayer('screen'), x: 0.03, y: 0.14, w: 0.56, h: 0.56, border: 4, borderColor: 'rgba(255,255,255,0.6)' },
          { ...newLayer('camera'), x: 0.56, y: 0.12, w: 0.44, h: 0.88, shape: 'rect', border: 0, cutout: true },
          { ...newLayer('text'), name: 'Name bar', x: 0.6, y: 0.84, w: 0.36, h: 0.09, text: '{name} · {role}', fontSize: 40, weight: 700, pill: true },
        ],
      }),
    },
    {
      name: 'Cookie cam lesson',
      make: () => ({
        name: 'Cookie cam lesson',
        bg: { kind: 'color', value: '#1b1b21' },
        layers: [
          { ...newLayer('screen'), x: 0.03, y: 0.09, w: 0.62, h: 0.62 },
          { ...newLayer('camera'), x: 0.68, y: 0.12, w: 0.29, h: H(0.29, 1), shape: 'cookie', border: 10, borderColor: '#bac3ff' },
          { ...newLayer('text'), name: 'Lesson title', x: 0.68, y: 0.7, w: 0.3, h: 0.1, text: '{title}', fontSize: 46, weight: 800 },
          { ...newLayer('text'), name: 'Name', x: 0.68, y: 0.8, w: 0.3, h: 0.08, text: '{name}', fontSize: 32, weight: 500 },
        ],
      }),
    },
    {
      name: 'Big title',
      make: () => ({
        name: 'Big title intro',
        bg: { kind: 'gradient', from: '#4a55a8', to: '#1a1d45' },
        layers: [
          { ...newLayer('shape'), name: 'Color band', x: 0, y: 0.62, w: 1, h: H(1, 4), shape: 'rect', fill: '#38437a' },
          { ...newLayer('camera'), x: 0.08, y: 0.1, w: 0.34, h: H(0.34, 1), shape: 'clover', border: 0 },
          { ...newLayer('text'), name: 'Title', x: 0.46, y: 0.24, w: 0.5, h: 0.2, text: '{title}', fontSize: 92, weight: 900 },
          { ...newLayer('text'), name: 'Subtitle', x: 0.46, y: 0.46, w: 0.5, h: 0.08, text: '{name}', fontSize: 38, weight: 500 },
        ],
      }),
    },
  ];
}

const KEY = 'recorder.customScenes';
export function loadCustom(): CustomScene[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as CustomScene[];
  } catch {
    return [];
  }
}
export function saveCustom(list: CustomScene[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* not persisted */
  }
}

// ---- media (images, video loops) ----
const cache = new Map<string, ImageBitmap | HTMLVideoElement>();

export async function storeMedia(file: File): Promise<string> {
  const key = `media:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await idbSet(key, file);
  return key;
}

/** Load (once) a stored image or looping, muted video. */
export async function loadMedia(key: string): Promise<ImageBitmap | HTMLVideoElement | null> {
  const hit = cache.get(key);
  if (hit) return hit;
  const blob = await idbGet<Blob>(key);
  if (!blob) return null;
  if (blob.type.startsWith('video/')) {
    const v = document.createElement('video');
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.src = URL.createObjectURL(blob);
    await v.play().catch(() => {});
    cache.set(key, v);
    return v;
  }
  const bmp = await createImageBitmap(blob).catch(() => null);
  if (bmp) cache.set(key, bmp);
  return bmp;
}
export const mediaNow = (key?: string) => (key ? cache.get(key) ?? null : null);

export const fillText = (t: string, v: { title: string; name: string; role: string }) =>
  t
    .replace(/\{title\}/g, v.title)
    .replace(/\{name\}/g, v.name)
    .replace(/\{role\}/g, v.role)
    .replace(/\{date\}/g, new Date().toLocaleDateString([], { month: 'short', day: 'numeric' }));
