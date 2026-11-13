// Teaching tools: HTML files from your computer and links, remembered
// between sessions. Files are kept in IndexedDB; links in localStorage.
import { idbGet, idbSet } from './idb';

export interface Tool {
  id: string;
  name: string;
  kind: 'file' | 'link';
  /** Link address, or the file name. */
  src: string;
}

const KEY = 'recorder.tools';

export function loadTools(): Tool[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as Tool[];
  } catch {
    return [];
  }
}

export function saveTools(list: Tool[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* not persisted */
  }
}

export const prettyName = (s: string): string => {
  const base = decodeURIComponent(s.split(/[?#]/)[0].split('/').filter(Boolean).pop() || s)
    .replace(/\.html?$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return base ? base[0].toUpperCase() + base.slice(1) : 'Tool';
};

export async function addFileTool(file: File): Promise<Tool> {
  const id = `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await idbSet(`tool:${id}`, file);
  return { id, name: prettyName(file.name), kind: 'file', src: file.name };
}

export function linkTool(url: string): Tool {
  const u = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return { id: `l${Date.now().toString(36)}`, name: prettyName(new URL(u).hostname + new URL(u).pathname), kind: 'link', src: u };
}

/** A URL the iframe can load. Files get a fresh blob: URL. */
export async function toolUrl(t: Tool): Promise<string | null> {
  if (t.kind === 'link') return t.src;
  const f = await idbGet<Blob>(`tool:${t.id}`);
  return f ? URL.createObjectURL(new Blob([f], { type: 'text/html' })) : null;
}

export async function forgetTool(t: Tool): Promise<void> {
  if (t.kind === 'file') await idbSet(`tool:${t.id}`, undefined);
}
