// The built-in browser: saved pages in a toolbar above the preview, a Pages
// panel to manage them, and the live pages themselves. Pages stay loaded in
// the background, so switching back keeps your place.

import { forwardRef, useState, type CSSProperties } from 'react';
import { embeddable, newPageId, titleFor, type Page } from '../lib/pages';
import { IconClose } from './icons';

const badge = (p: Page) => (p.title.trim()[0] ?? '•').toUpperCase();

export function PageToolbar(props: {
  pages: Page[];
  active: string | null;
  onPick: (id: string) => void;
  onOpen: (url: string) => void;
  onAdd: (url: string) => void;
  onReload: () => void;
}) {
  const { pages, active, onPick, onOpen, onAdd, onReload } = props;
  const [draft, setDraft] = useState('');
  const current = pages.find((p) => p.id === active);
  const go = () => {
    if (!draft.trim()) return;
    onOpen(draft);
    setDraft('');
  };
  return (
    <div className="page-bar" role="toolbar" aria-label="Pages">
      <div className="page-tabs scroll" role="tablist" aria-label="Saved pages">
        {pages.map((p, i) => (
          <button key={p.id} type="button" role="tab" aria-selected={p.id === active} className={`page-tab press ${p.id === active ? 'active' : ''}`} onClick={() => onPick(p.id)} title={`${p.title}${i < 9 ? ` (Alt+${i + 1})` : ''}`}>
            <i aria-hidden="true">{badge(p)}</i>
            <span>{p.title}</span>
          </button>
        ))}
      </div>
      <div className="page-address">
        <button type="button" className="icon-btn press" aria-label="Reload page" title="Reload" onClick={onReload} disabled={!current}>
          ↻
        </button>
        <input
          aria-label="Web address"
          placeholder={current ? current.url : 'Web address'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') go();
          }}
        />
        <button
          type="button"
          className="small-btn press"
          onClick={() => {
            if (draft.trim()) {
              onAdd(draft);
              setDraft('');
            } else if (current) onAdd(current.url);
          }}
          title="Save as a page"
        >
          + Save page
        </button>
      </div>
    </div>
  );
}

export function PagesPanel(props: { pages: Page[]; active: string | null; setPages: (p: Page[]) => void; onPick: (id: string) => void; onAdd: (url: string) => void }) {
  const { pages, active, setPages, onPick, onAdd } = props;
  const [url, setUrl] = useState('');
  const move = (i: number, d: number) => {
    const n = pages.slice();
    const j = i + d;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    setPages(n);
  };
  return (
    <div className="section">
      <h2 className="h-section">Pages</h2>
      <div className="note">Web pages you can switch between while you record, in any scene that shows the browser. Your own tools on GitHub Pages work great.</div>
      <label className="field">
        Add a page
        <div className="row">
          <input
            type="url"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && url.trim()) {
                onAdd(url);
                setUrl('');
              }
            }}
          />
          <button
            className="small-btn press"
            type="button"
            onClick={() => {
              if (!url.trim()) return;
              onAdd(url);
              setUrl('');
            }}
          >
            Add
          </button>
        </div>
      </label>
      {pages.length === 0 && <div className="empty">No pages yet. Add one here or in the address bar above the preview.</div>}
      {pages.map((p, i) => (
        <div key={p.id} className={`tile ${p.id === active ? 'selected' : ''}`}>
          <button type="button" className="tile-btn" onClick={() => onPick(p.id)}>
            <div className="tool-badge" aria-hidden="true">
              {badge(p)}
            </div>
            <div className="tile-main">
              <input
                className="page-title-input"
                aria-label="Page name"
                value={p.title}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setPages(pages.map((x) => (x.id === p.id ? { ...x, title: e.target.value } : x)))}
              />
              <div className="tile-note">{p.url.replace(/^https?:\/\//, '')}</div>
            </div>
          </button>
          <div className="page-actions">
            <button className="icon-btn press" type="button" aria-label={`Move ${p.title} up`} onClick={() => move(i, -1)} disabled={i === 0}>
              ↑
            </button>
            <button className="icon-btn press" type="button" aria-label={`Move ${p.title} down`} onClick={() => move(i, 1)} disabled={i === pages.length - 1}>
              ↓
            </button>
            <button className="icon-btn press" type="button" aria-label={`Remove ${p.title}`} onClick={() => setPages(pages.filter((x) => x.id !== p.id))}>
              <IconClose />
            </button>
          </div>
        </div>
      ))}
      <div className="note">Switch pages with the tabs above the preview, Alt + 1–9, or the mini window. A blank page usually means that site doesn’t allow being shown inside other apps; look for its “embed” or “publish to web” link.</div>
    </div>
  );
}

/** The live pages, stacked; only the active one is visible. */
export const BrowserHost = forwardRef<
  HTMLDivElement,
  { pages: Page[]; active: string | null; reloads: Record<string, number>; style?: CSSProperties; behind: boolean; captured: boolean; onCapture: () => void }
>(function BrowserHost({ pages, active, reloads, style, behind, captured, onCapture }, ref) {
  return (
    // Before recording is approved the page sits on top so you can see it.
    // Once Chrome records it, it moves under the preview (which lets clicks
    // through), so you see the finished picture with your camera on top and
    // can still click and scroll the page.
    <div ref={ref} className={`tool-host browser-host ${behind ? 'behind' : captured ? 'under' : ''}`} style={style} aria-hidden={behind}>
      {pages.map((p) => (
        <iframe
          key={`${p.id}:${reloads[p.id] ?? 0}`}
          title={p.title}
          src={p.url}
          className={p.id === active ? 'on' : ''}
          sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads allow-presentation"
          allow="autoplay; fullscreen; clipboard-write; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ))}
      {!behind && pages.length > 0 && !captured && (
        <button type="button" className="tool-capture press" onClick={onCapture}>
          Show pages in the recording
        </button>
      )}
    </div>
  );
});

export function makePage(input: string, count = 0): Page {
  const url = embeddable(input);
  const title = /^https?:/i.test(url) ? titleFor(url) : '';
  return { id: newPageId(), title: title || `Page ${count + 1}`, url };
}
