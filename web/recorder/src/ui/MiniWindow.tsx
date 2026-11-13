// Floating mini control window (Chrome's Document Picture-in-Picture).
// It stays above every other app, so you can teach in Slides or PowerPoint
// and still switch scenes, pause and stop. It is never recorded.

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { SCENES } from '../engine/scenes';
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
  setScene: (id: number) => void;
  phase: 'idle' | 'countdown' | 'recording';
  paused: boolean;
  elapsed: string;
  count: number;
  onRecord: () => void;
  onPause: () => void;
}) {
  const { win, scene, setScene, phase, paused, elapsed, count, onRecord, onPause } = props;
  const live = phase === 'recording';
  const current = SCENES.find((s) => s.id === scene);
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
      <div className="mini-grid">
        {SCENES.map((s) => (
          <button key={s.id} type="button" className={`mini-scene press ${s.id === scene ? 'active' : ''}`} aria-pressed={s.id === scene} onClick={() => setScene(s.id)} title={s.name}>
            <b>{s.id}</b>
            <span>{s.name}</span>
          </button>
        ))}
      </div>
      <div className="note">Stays above your other apps. Not recorded.</div>
    </div>,
    win.document.body,
  );
}
