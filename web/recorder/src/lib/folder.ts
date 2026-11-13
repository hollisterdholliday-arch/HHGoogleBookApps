// The save folder: picked once with Chrome's folder picker, remembered in
// IndexedDB, and written to directly. Browsers without folder access fall
// back to a normal download.

import type { SavedFile, Sink } from '../engine/recorder';

const DB = 'recorder';
const STORE = 'kv';
const KEY = 'saveFolder';

function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });
}

export const canPickFolder = (): boolean => typeof window.showDirectoryPicker === 'function';

export async function savedFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!canPickFolder()) return null;
  try {
    return ((await idb('readonly', (s) => s.get(KEY))) as FileSystemDirectoryHandle | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function chooseFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!canPickFolder()) return null;
  try {
    const dir = await window.showDirectoryPicker({ id: 'recorder-save', mode: 'readwrite', startIn: 'videos' });
    await idb('readwrite', (s) => s.put(dir, KEY));
    return dir;
  } catch {
    return null; // cancelled
  }
}

/** Ask again for write access if Chrome has forgotten it. Needs a click. */
export async function ensureWritable(dir: FileSystemDirectoryHandle): Promise<boolean> {
  const opts = { mode: 'readwrite' as const };
  if ((await dir.queryPermission(opts)) === 'granted') return true;
  return (await dir.requestPermission(opts)) === 'granted';
}

export function fileNameFor(title: string, ext: string, d = new Date()): string {
  const safe = (title || 'Recording').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Recording';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${safe} ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${ext}`;
}

async function uniqueName(dir: FileSystemDirectoryHandle, name: string): Promise<string> {
  const dot = name.lastIndexOf('.');
  const base = name.slice(0, dot);
  const ext = name.slice(dot);
  for (let i = 0; i < 100; i++) {
    const n = i ? `${base} (${i + 1})${ext}` : name;
    try {
      await dir.getFileHandle(n);
    } catch {
      return n;
    }
  }
  return `${base} ${Date.now()}${ext}`;
}

export async function folderSink(dir: FileSystemDirectoryHandle, wanted: string): Promise<Sink> {
  const name = await uniqueName(dir, wanted);
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  return {
    write: (c) => w.write(c),
    close: async (): Promise<SavedFile> => {
      await w.close();
      return { name, where: dir.name, open: async () => URL.createObjectURL(await fh.getFile()) };
    },
    abort: async () => {
      await w.abort().catch(() => {});
      await dir.removeEntry(name).catch(() => {});
    },
  };
}

export function downloadSink(name: string, mime: string): Sink {
  const parts: Blob[] = [];
  return {
    write: async (c) => void parts.push(c),
    close: async (): Promise<SavedFile> => {
      const url = URL.createObjectURL(new Blob(parts, { type: mime.split(';')[0] || 'video/webm' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      return { name, where: 'Downloads', open: async () => url };
    },
    abort: async () => void (parts.length = 0),
  };
}
