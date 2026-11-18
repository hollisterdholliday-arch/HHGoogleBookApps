// Saved web pages for the built-in browser, remembered between visits.

export interface Page {
  id: string;
  title: string;
  url: string;
}

const KEY = 'recorder.pages';

export function loadPages(): Page[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as Page[];
  } catch {
    return [];
  }
}

export function savePages(list: Page[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* not persisted */
  }
}

/**
 * Turn what someone typed into an address that can run inside the recorder.
 * Some sites refuse to be shown inside other apps on their normal pages but
 * offer an embed/preview address that works, so those are swapped in.
 */
export function embeddable(input: string): string {
  let s = input.trim();
  if (!s) return '';
  if (!/^[a-z]+:/i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return s;
  }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  // YouTube: watch / shorts / youtu.be -> embed player
  if (host === 'youtube.com' && u.pathname === '/watch' && u.searchParams.get('v')) return `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
  if (host === 'youtube.com' && u.pathname.startsWith('/shorts/')) return `https://www.youtube.com/embed/${u.pathname.split('/')[2]}`;
  if (host === 'youtu.be' && u.pathname.length > 1) return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
  // Google Docs / Slides / Sheets / Drive files: editor pages -> preview pages
  if (host === 'docs.google.com') {
    const m = u.pathname.match(/^\/(document|presentation|spreadsheets|forms)\/d\/([^/]+)/);
    if (m && m[1] !== 'forms') return `https://docs.google.com/${m[1]}/d/${m[2]}/preview`;
  }
  if (host === 'drive.google.com') {
    const m = u.pathname.match(/^\/file\/d\/([^/]+)/);
    if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
  }
  // Vimeo
  if (host === 'vimeo.com' && /^\/\d+/.test(u.pathname)) return `https://player.vimeo.com/video/${u.pathname.split('/')[1]}`;
  return u.href;
}

/** A short label for a page: the site name plus the last part of its address. */
export function titleFor(url: string): string {
  try {
    const u = new URL(url);
    const site = u.hostname.replace(/^www\./, '');
    const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '')
      .replace(/\.html?$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim();
    return last && last.length < 40 && !/^[A-Za-z0-9_-]{20,}$/.test(last) ? `${last[0].toUpperCase()}${last.slice(1)}` : site;
  } catch {
    return url;
  }
}

export const newPageId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
