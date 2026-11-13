import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { SCENES, type Box, type Layout } from '../engine/scenes';
import type { SceneText } from '../engine/compositor';
import type { DeviceLists } from '../engine/studio';
import { Studio } from '../engine/studio';
import type { Sink } from '../engine/recorder';
import { canPickFolder, chooseFolder, downloadSink, ensureWritable, fileNameFor, folderSink, savedFolder } from '../lib/folder';
import { IconCamera, IconClose, IconFolder, IconMic, IconMoon, IconPause, IconPlay, IconScreen, IconSun } from './icons';

// One studio for the whole page (React StrictMode mounts twice in dev).
let studioSingleton: Studio | null = null;
const getStudio = () => (studioSingleton ??= new Studio());

const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(`recorder.${k}`);
      return v ? (JSON.parse(v) as T) : d;
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(`recorder.${k}`, JSON.stringify(v));
    } catch {
      /* private window: settings just won't persist */
    }
  },
};

const DEFAULT_TEXT: SceneText = {
  title: 'Solving two-step equations',
  name: 'Your name',
  role: 'Algebra 1 · Online',
  problem: '3x − 4 = 11',
  outro: 'Questions? Post them in Classroom.',
  brb: 'Grab a pencil and your notes',
};

type Phase = 'idle' | 'countdown' | 'recording';
interface Toast {
  msg: string;
  action?: { label: string; run: () => void };
}

const fmt = (s: number) => {
  const t = Math.floor(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${String(m).padStart(2, '0')}:${sec}`;
};

const errText = (e: unknown) => (e instanceof DOMException && e.name === 'NotAllowedError' ? 'blocked' : 'unavailable');

export function App() {
  const studio = getStudio();
  const [, rerender] = useState(0);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => store.get('theme', 'dark'));
  const [scene, setSceneState] = useState<number>(() => store.get('scene', 2));
  const [text, setText] = useState<SceneText>(() => ({ ...DEFAULT_TEXT, ...store.get('text', {}) }));
  const [mirror, setMirror] = useState<boolean>(() => store.get('mirror', false));
  const [micMuted, setMicMuted] = useState(false);
  const [tab, setTab] = useState<'text' | 'sources'>('text');
  const [devices, setDevices] = useState<DeviceLists>({ cameras: [], mics: [] });
  const [folder, setFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [count, setCount] = useState(0);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const ambientRef = useRef<HTMLCanvasElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const countTimers = useRef<number[]>([]);
  const toastTimer = useRef<number>(0);

  const supported = typeof navigator.mediaDevices?.getDisplayMedia === 'function' && typeof MediaRecorder !== 'undefined';

  const say = useCallback((t: Toast, ms = 6000) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  }, []);

  const refreshDevices = useCallback(() => {
    studio.devices().then(setDevices, () => {});
  }, [studio]);

  // ---- wire up the engine ----
  useEffect(() => {
    studio.onChange = () => rerender((n) => n + 1);
    const stage = stageRef.current!;
    stage.prepend(studio.comp.canvas);
    studio.comp.ambient = ambientRef.current;
    studio.comp.setScene(scene);
    void document.fonts.load('800 40px "Roboto Flex"');
    savedFolder().then(setFolder);
    if (!studio.cameraLive) studio.startCamera().catch((e) => say({ msg: `Camera ${errText(e)}. Allow it from the address bar, then turn the camera on.` }));
    if (!studio.micLive) studio.startMic().then(refreshDevices, (e) => say({ msg: `Microphone ${errText(e)}.` }));
    navigator.mediaDevices?.addEventListener('devicechange', refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    store.set('theme', theme);
  }, [theme]);
  useEffect(() => {
    studio.comp.text = text;
    store.set('text', text);
  }, [studio, text]);
  useEffect(() => {
    studio.comp.mirrorCamera = mirror;
    store.set('mirror', mirror);
  }, [studio, mirror]);
  useEffect(() => studio.audio.setMicMuted(micMuted), [studio, micMuted]);

  const setScene = useCallback(
    (id: number) => {
      studio.comp.setScene(id);
      setSceneState(id);
      store.set('scene', id);
    },
    [studio],
  );

  // Mic meter, updated without re-rendering React.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const lvl = studio.audio.level();
      const bars = meterRef.current?.children;
      if (bars) for (let i = 0; i < bars.length; i++) (bars[i] as HTMLElement).style.transform = `scaleY(${Math.max(0.2, Math.min(1, lvl * (0.6 + ((i * 37) % 5) / 6)))})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [studio]);

  // Recording timer + window title + app icon badge.
  useEffect(() => {
    if (phase !== 'recording') {
      document.title = 'Recorder';
      (navigator as Navigator & { clearAppBadge?: () => Promise<void> }).clearAppBadge?.().catch(() => {});
      return;
    }
    (navigator as Navigator & { setAppBadge?: () => Promise<void> }).setAppBadge?.().catch(() => {});
    const iv = window.setInterval(() => {
      const s = studio.recording?.elapsed() ?? 0;
      setElapsed(s);
      document.title = `${studio.recording?.paused ? '❚❚ Paused' : '● REC'} ${fmt(s)} · Recorder`;
    }, 250);
    return () => clearInterval(iv);
  }, [phase, studio]);

  // ---- actions ----
  const toggleShare = async () => {
    if (studio.sharing) return studio.stopShare();
    try {
      await studio.shareScreen();
      if (scene === 1 || scene === 4 || scene >= 6) setScene(2);
    } catch (e) {
      if (errText(e) === 'blocked') return; // user closed the picker
      say({ msg: 'Screen sharing is not available here.' });
    }
  };
  const toggleCam = async () => {
    if (studio.cameraLive) return studio.stopCamera();
    try {
      await studio.startCamera();
      refreshDevices();
    } catch (e) {
      say({ msg: `Camera ${errText(e)}.` });
    }
  };
  const toggleMic = async () => {
    if (!studio.micLive) {
      try {
        await studio.startMic();
        setMicMuted(false);
        refreshDevices();
      } catch (e) {
        say({ msg: `Microphone ${errText(e)}.` });
      }
      return;
    }
    setMicMuted((m) => !m);
  };

  const pickFolder = async () => {
    const d = await chooseFolder();
    if (d) {
      setFolder(d);
      say({ msg: `Recordings will be saved to “${d.name}”.` }, 4000);
    }
    return d;
  };

  const cancelCountdown = () => {
    countTimers.current.forEach(clearTimeout);
    countTimers.current = [];
    setCount(0);
    setPhase('idle');
  };

  const startRecording = async () => {
    studio.audio.resume();
    const name = fileNameFor(text.title, studio.format.ext);
    let sink: Sink | null = null;
    try {
      let dir = folder;
      if (dir && !(await ensureWritable(dir))) dir = null;
      if (!dir && canPickFolder()) {
        say({ msg: 'Choose a folder for your recordings. You only do this once.' }, 4000);
        dir = await pickFolder();
      }
      sink = dir ? await folderSink(dir, name) : downloadSink(name, studio.format.mime);
    } catch {
      sink = downloadSink(name, studio.format.mime);
    }
    setPhase('countdown');
    setCount(3);
    const s = sink;
    countTimers.current = [
      window.setTimeout(() => setCount(2), 900),
      window.setTimeout(() => setCount(1), 1800),
      window.setTimeout(() => {
        setCount(0);
        try {
          studio.startRecording(s);
          setPaused(false);
          setElapsed(0);
          setPhase('recording');
        } catch {
          setPhase('idle');
          void s.abort();
          say({ msg: 'Could not start recording in this browser.' });
        }
      }, 2700),
    ];
  };

  const stopRecording = async () => {
    setPhase('idle');
    setPaused(false);
    try {
      const saved = await studio.stopRecording();
      if (saved)
        say(
          {
            msg: `Saved “${saved.name}” to ${saved.where}`,
            action: { label: 'Play', run: () => saved.open().then((u) => window.open(u, '_blank')) },
          },
          10000,
        );
    } catch {
      say({ msg: 'Something went wrong while saving. Check that the save folder still exists.' });
    }
  };

  const toggleRecord = () => {
    if (phase === 'recording') return void stopRecording();
    if (phase === 'countdown') return cancelCountdown();
    void startRecording();
  };
  const togglePause = () => {
    const r = studio.recording;
    if (!r) return;
    if (r.paused) r.resume();
    else r.pause();
    setPaused(r.paused);
  };

  // Keyboard: 1–8 or Ctrl+1–8 switch scenes; Ctrl+Shift+Enter records; Ctrl+Shift+Space pauses.
  const keys = useRef({ toggleRecord, togglePause, setScene });
  keys.current = { toggleRecord, togglePause, setScene };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        keys.current.toggleRecord();
      } else if (mod && e.shiftKey && e.code === 'Space') {
        e.preventDefault();
        keys.current.togglePause();
      } else if (/^[1-9]$/.test(e.key) && (mod || (!typing && !e.altKey))) {
        const id = Number(e.key);
        if (SCENES.some((s) => s.id === id)) {
          e.preventDefault();
          keys.current.setScene(id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const live = phase === 'recording';
  const setField = (k: keyof SceneText) => (e: React.ChangeEvent<HTMLInputElement>) => setText((t) => ({ ...t, [k]: e.target.value }));

  return (
    <div className="app">
      <div className="ambient" aria-hidden="true">
        <canvas ref={ambientRef} width={64} height={36} />
      </div>

      <header className="titlebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span />
          </div>
          <span className="brand-name">Recorder</span>
          <span className="brand-sub">{text.title}</span>
        </div>
        {phase !== 'idle' && (
          <div role="status" className={`rec-chip ${paused ? 'paused' : ''}`}>
            <i aria-hidden="true" />
            <span>{phase === 'countdown' ? 'Starting…' : `${paused ? 'Paused' : 'REC'} ${fmt(elapsed)}`}</span>
          </div>
        )}
        <div className="title-actions">
          <button className="icon-btn press" type="button" aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
        </div>
      </header>

      {!supported && <div className="banner">This browser can’t record. Open Recorder in Google Chrome or Microsoft Edge on a computer.</div>}

      <main className="body">
        <section className="stage-col" aria-label="Preview">
          <div className="stage-wrap">
            <div className="stage" ref={stageRef}>
              {phase === 'countdown' && count > 0 && (
                <div className="countdown" aria-live="assertive">
                  <span key={count}>{count}</span>
                </div>
              )}
            </div>

            <div className="controls">
              <div className="controls-inner" role="toolbar" aria-label="Recording controls">
                <button className={`tbtn press ${studio.sharing ? 'on' : ''}`} type="button" aria-pressed={studio.sharing} onClick={toggleShare}>
                  <IconScreen />
                  <span>{studio.sharing ? 'Stop sharing' : 'Share screen'}</span>
                </button>
                <button className={`tbtn press ${studio.cameraLive ? 'on' : ''}`} type="button" aria-label="Camera" aria-pressed={studio.cameraLive} onClick={toggleCam}>
                  <IconCamera />
                </button>
                <button className={`tbtn press ${studio.micLive && !micMuted ? 'on' : ''}`} type="button" aria-label="Microphone" aria-pressed={studio.micLive && !micMuted} onClick={toggleMic}>
                  <IconMic />
                  <div className="meter" ref={meterRef} aria-hidden="true">
                    {[10, 16, 18, 13, 8].map((h, i) => (
                      <b key={i} style={{ height: h }} />
                    ))}
                  </div>
                </button>
                <button className={`rec-btn press ${live ? 'live' : ''}`} type="button" onClick={toggleRecord} disabled={!supported} aria-label={live ? 'Stop recording' : phase === 'countdown' ? 'Cancel countdown' : 'Start recording'}>
                  <i aria-hidden="true" />
                  <span>{live ? 'Stop' : phase === 'countdown' ? 'Cancel' : 'Record'}</span>
                </button>
                <button className={`tbtn press ${paused ? 'on' : ''}`} type="button" disabled={!live} onClick={togglePause} aria-label={paused ? 'Resume recording' : 'Pause recording'}>
                  {paused ? <IconPlay /> : <IconPause />}
                </button>
              </div>
            </div>
          </div>

          <nav className="scenes" aria-label="Scenes">
            <div className="scenes-head">
              <h2>Scenes</h2>
              <span className="hint">Click or press 1–{SCENES.length}, even while recording</span>
            </div>
            <div className="strip scroll">
              {SCENES.map((s) => (
                <button key={s.id} type="button" className={`scene-card press ${s.id === scene ? 'active' : ''}`} aria-pressed={s.id === scene} onClick={() => setScene(s.id)}>
                  <Thumb layout={s.layout} />
                  <div className="scene-meta">
                    <span>{s.name}</span>
                    <span className="key">{s.id}</span>
                  </div>
                </button>
              ))}
            </div>
          </nav>
        </section>

        <aside className="panel scroll" aria-label="Settings">
          <div className="tabs" role="tablist">
            {(['text', 'sources'] as const).map((t) => (
              <button key={t} role="tab" type="button" aria-selected={tab === t} className={`tab press ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                {t === 'text' ? 'Text' : 'Sources'}
              </button>
            ))}
          </div>

          {tab === 'text' && (
            <div className="section">
              <h2 className="h-section">Scene text</h2>
              <label className="field">
                Lesson title
                <input value={text.title} onChange={setField('title')} />
              </label>
              <label className="field">
                Your name
                <input value={text.name} onChange={setField('name')} />
              </label>
              <label className="field">
                Name bar subtitle
                <input value={text.role} onChange={setField('role')} />
              </label>
              <label className="field">
                “Try this” problem
                <input value={text.problem} onChange={setField('problem')} />
              </label>
              <label className="field">
                Outro message
                <input value={text.outro} onChange={setField('outro')} />
              </label>
              <label className="field">
                “Be right back” note
                <input value={text.brb} onChange={setField('brb')} />
              </label>
            </div>
          )}

          {tab === 'sources' && (
            <div className="section">
              <h2 className="h-section">Sources</h2>
              <div className="tile">
                <div className="tile-main">
                  <div className="tile-title">Screen</div>
                  <div className="tile-note">{studio.sharing ? `${studio.screenLabel}${studio.audio.hasSystemAudio ? ' · with sound' : ''}` : 'Not shared'}</div>
                </div>
                <button className="text-btn press" type="button" onClick={async () => {
                  if (studio.sharing) studio.stopShare();
                  await toggleShare();
                }}>
                  {studio.sharing ? 'Change' : 'Share'}
                </button>
              </div>
              <label className="field">
                Camera
                <select
                  value={studio.cameraId}
                  onChange={(e) => studio.startCamera(e.target.value).catch((er) => say({ msg: `Camera ${errText(er)}.` }))}
                >
                  {devices.cameras.length === 0 && <option value="">No camera found</option>}
                  {devices.cameras.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Camera ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
              <div className="row">
                <div className="tile-main">
                  <div className="tile-title">Mirror camera</div>
                  <div className="note">Off records you the way others see you, so text behind you reads correctly.</div>
                </div>
                <button className="switch" type="button" role="switch" aria-checked={mirror} aria-label="Mirror camera" onClick={() => setMirror(!mirror)}>
                  <i />
                </button>
              </div>
              <label className="field">
                Microphone
                <select value={studio.micId} onChange={(e) => studio.startMic(e.target.value).catch((er) => say({ msg: `Microphone ${errText(er)}.` }))}>
                  {devices.mics.length === 0 && <option value="">No microphone found</option>}
                  {devices.mics.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Microphone ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
              <div className="note">To record sound from a video or app, tick “Share audio” in Chrome’s share picker.</div>
            </div>
          )}

          <div className="divider" />
          <div className="row">
            <div className="chip-icon" aria-hidden="true">
              <IconFolder />
            </div>
            <div className="tile-main">
              <div className="tile-note">Saving to · {studio.format.ext.toUpperCase()} · 1080p 30 fps</div>
              <div className="tile-title">{folder ? folder.name : canPickFolder() ? 'Choose a folder' : 'Downloads'}</div>
            </div>
            {canPickFolder() && (
              <button className="text-btn press" type="button" onClick={pickFolder} disabled={phase !== 'idle'}>
                Change
              </button>
            )}
          </div>
        </aside>
      </main>

      {toast && (
        <div role="status" className="toast">
          <span>{toast.msg}</span>
          {toast.action && (
            <button type="button" className="press" onClick={toast.action.run}>
              {toast.action.label}
            </button>
          )}
          <button type="button" className="press" aria-label="Dismiss" onClick={() => setToast(null)}>
            <IconClose />
          </button>
        </div>
      )}
    </div>
  );
}

// Scene thumbnail drawn from the same layout numbers the recorder uses.
const CARD_BG: Record<string, string> = { problem: '#fff1e6', brb: '#38437a', outro: '#20233f' };
function boxStyle(b: Box, extra: CSSProperties): CSSProperties {
  return {
    left: `${b.x * 100}%`,
    top: `${b.y * 100}%`,
    width: `${b.w * 100}%`,
    height: `${b.h * 100}%`,
    borderRadius: b.circle ? '50%' : `${b.r * 100 * 6}%`,
    opacity: b.o,
    ...extra,
  };
}
function Thumb({ layout }: { layout: Layout }) {
  return (
    <div className="thumb" aria-hidden="true">
      <div style={boxStyle(layout.screen, { background: '#eef0fb' })} />
      {layout.card && <div style={{ inset: 0, background: CARD_BG[layout.card] }} />}
      <div style={boxStyle(layout.camera, { background: 'linear-gradient(165deg,#6b5546,#2f2622)', boxShadow: layout.camera.ring ? '0 0 0 2px #fff' : 'none' })} />
      {layout.title && <div style={{ left: '8%', bottom: '14%', width: '50%', height: '10%', borderRadius: 3, background: 'rgba(255,255,255,.9)' }} />}
      {layout.lower && <div style={{ left: '5%', bottom: '8%', width: '40%', height: '14%', borderRadius: 4, background: 'rgba(20,22,40,.75)' }} />}
    </div>
  );
}
