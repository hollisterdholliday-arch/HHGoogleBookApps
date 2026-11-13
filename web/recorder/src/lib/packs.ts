// Scene packs: your custom scenes (with their pictures and videos) and
// brand kit in one file you can send to other teachers.

import type { CustomScene } from '../engine/custom';
import { idbGet, idbSet } from './idb';

export interface BrandSettings {
  bar: string;
  accent: string;
  text: string;
  font: 'modern' | 'rounded' | 'serif';
  logoOn: boolean;
}

interface Pack {
  kind: 'recorder-pack';
  version: 1;
  scenes: CustomScene[];
  brand?: BrandSettings;
  logo?: string;
  media: Record<string, string>; // key -> data: URL
}

const toDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

export async function exportPack(scenes: CustomScene[], brand: BrandSettings | null): Promise<Blob> {
  const media: Record<string, string> = {};
  const keys = new Set<string>();
  for (const s of scenes) {
    if (s.bg.kind === 'video') keys.add(s.bg.media);
    for (const l of s.layers) if (l.media) keys.add(l.media);
  }
  for (const k of keys) {
    const b = await idbGet<Blob>(k);
    if (b) media[k] = await toDataUrl(b);
  }
  const logo = brand ? await idbGet<Blob>('brandLogo') : undefined;
  const pack: Pack = { kind: 'recorder-pack', version: 1, scenes, brand: brand ?? undefined, logo: logo ? await toDataUrl(logo) : undefined, media };
  return new Blob([JSON.stringify(pack)], { type: 'application/json' });
}

/** Reads a pack and stores its media; scenes get fresh ids starting at `nextId`. */
export async function importPack(file: File, nextId: number): Promise<{ scenes: CustomScene[]; brand?: BrandSettings; logo?: Blob }> {
  const pack = JSON.parse(await file.text()) as Pack;
  if (pack.kind !== 'recorder-pack' || !Array.isArray(pack.scenes)) throw new Error('Not a scene pack');
  const remap: Record<string, string> = {};
  for (const [k, url] of Object.entries(pack.media ?? {})) {
    const blob = await (await fetch(url)).blob();
    const nk = `media:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    await idbSet(nk, blob);
    remap[k] = nk;
  }
  const scenes = pack.scenes.map((s, i) => ({
    ...s,
    id: nextId + i,
    bg: s.bg.kind === 'video' ? { ...s.bg, media: remap[s.bg.media] ?? s.bg.media } : s.bg,
    layers: s.layers.map((l) => (l.media ? { ...l, media: remap[l.media] ?? l.media } : l)),
  }));
  const logo = pack.logo ? await (await fetch(pack.logo)).blob() : undefined;
  return { scenes, brand: pack.brand, logo };
}
