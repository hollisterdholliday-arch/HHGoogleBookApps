// Floating mini control window (Chrome's Document Picture-in-Picture).
// It stays above every other app, so you can teach in Slides or PowerPoint
// and still switch scenes, pause and stop. It is never recorded.

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconPause, IconPlay } from './icons';

interface DocumentPiP {
  requestWindow(opts: { width: number; height: number }): Promise<Window>;
  window: Window | null;
}
const dpip = (): DocumentPiP | undefined => (window as unknown as { documentPictureInPicture?: DocumentPiP }).documentPictureInPicture;

export const miniSupported = () => !!dpip();

export function useMiniWindow(theme: string) {
  const [win, setWin] = useState<Window | null>(null);

  const open = useCallback(async () => {
    const api = dpip();
    if (!api || api.window) return;
    const w = await api.requestWindow({ width: 340, height: 380 });
    // Bring the app's styles and fonts into the new window.
    document.head.querySelectorAll('style, link[rel="stylesheet"], link[rel="preconnect"]').forEach((n) => w.document.head.appendChild(n.cloneNode(true)));
    w.document.title = 'Recorder controls';
    w.document.body.className = 'mini-body';
    w.addEventListener('pagehide', () => setWin(null));
    setWin(w);
  }, []);

  const close = useCallback(() => win?.close(), [win]);

  useEffect(() => {
    if (win) win.document.documentElement.dataset.theme = theme;
  }, [win, theme]);

  return { win, open, close };
}

export function MiniPanel(props: {
  win: Window;
  scene: number;
  scenes: { id: number; name: string }[];
  setScene: (id: number) => void;
  phase: 'idle' | 'countdown' | 'recording';
  paused: boolean;
  elapsed: string;
  count: number;
  onRecord: () => void;
  onPause: () => void;
  slides: { page: number; pages: number; next: () => void; prev: () => void } | null;
}) {
  const { win, scene, scenes, setScene, phase, paused, elapsed, count, onRecord, onPause, slides } = props;
  const live = phase === 'recording';
  const current = scenes.find((s) => s.id === scene);
  const status = phase === 'countdown' ? `Starting in ${count}…` : live ? `${paused ? 'Paused' : 'Recording'} · ${elapsed}` : 'Not recording';
  return createPortal(
    <div className="mini">
      <div className="mini-top">
        <div className="mini-now">
          <span className="note">Now showing</span>
          <b>{current?.name}</b>
        </div>
        <button className={`mini-rec press ${live ? 'live' : ''}`} type="button" onClick={onRecord} aria-label={live ? 'Stop recording' : phase === 'countdown' ? 'Cancel countdown' : 'Start recording'}>
          <i aria-hidden="true" />
        </button>
        <button className={`tbtn press ${paused ? 'on' : ''}`} type="button" disabled={!live} onClick={onPause} aria-label={paused ? 'Resume recording' : 'Pause recording'}>
          {paused ? <IconPlay /> : <IconPause />}
        </button>
      </div>
      <div className={`mini-status ${live && !paused ? 'live' : ''}`} role="status">
        {live && !paused && <i aria-hidden="true" />}
        {status}
      </div>
      {slides && (
        <div className="mini-slides">
          <button type="button" className="round-btn press" aria-label="Previous slide" onClick={slides.prev}>
            ‹
          </button>
          <b>
            Slide {slides.page} / {slides.pages}
          </b>
          <button type="button" className="round-btn press primary" aria-label="Next slide" onClick={slides.next}>
            ›
          </button>
        </div>
      )}
      <div className="mini-grid">
        {scenes.map((s, i) => (
          <button key={s.id} type="button" className={`mini-scene press ${s.id === scene ? 'active' : ''}`} aria-pressed={s.id === scene} onClick={() => setScene(s.id)} title={s.name}>
            <b>{s.id < 100 ? s.id : `★${i - scenes.findIndex((x) => x.id >= 100) + 1}`}</b>
            <span>{s.name}</span>
          </button>
        ))}
      </div>
      <div className="note">Stays above your other apps. Not recorded.</div>
    </div>,
    win.document.body,
  );
}
