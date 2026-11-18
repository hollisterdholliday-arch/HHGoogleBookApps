import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { SCENES, sceneById, type Box, type Layout } from '../engine/scenes';
import { DEFAULT_FX, type BgMode, type BgPreset, type FxSettings } from '../engine/effects';
import { idbGet, idbSet } from '../lib/idb';
import { MiniPanel, miniSupported, useMiniWindow } from './MiniWindow';
import { Library } from './Library';
import { Builder } from './Builder';
import { BITRATES, DEFAULT_PREFS, Settings, type Prefs } from './Settings';
import { Welcome } from './Welcome';
import { applyAccent } from '../lib/theme';
import { exportPack, importPack } from '../lib/packs';
import { cssClip, exampleScene, loadCustom, loadMedia, saveCustom, templates, type CustomScene } from '../engine/custom';
import { captionAvailability, installCaptions, type CaptionAvailability } from '../engine/captions';
import { loadPages, savePages, type Page } from '../lib/pages';
import { BrowserHost, makePage, PagesPanel, PageToolbar } from './Browser';
import type { SceneText } from '../engine/compositor';
import type { DeviceLists } from '../engine/studio';
import { Studio } from '../engine/studio';
import type { Sink } from '../engine/recorder';
import { canPickFolder, chooseFolder, downloadSink, ensureWritable, fileNameFor, folderSink, savedFolder } from '../lib/folder';
import { IconCamera, IconClose, IconFolder, IconMic, IconMoon, IconPause, IconPip, IconPlay, IconSun } from './icons';

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

// Everything starts blank: nothing shows in a recording unless you typed it.
const DEFAULT_TEXT: SceneText = { title: '', name: '', role: '', problemTitle: '', problem: '', brbTitle: '', brb: '', outroTitle: '', outro: '' };
// Sample values from earlier versions, cleared once on update.
const OLD_SAMPLES: Partial<Record<keyof SceneText, string>> = {
  title: 'Solving two-step equations',
  name: 'Your name',
  role: 'Algebra 1 · Online',
  problem: '3x − 4 = 11',
  outro: 'Questions? Post them in Classroom.',
  brb: 'Grab a pencil and your notes',
};
function loadText(saved: Partial<SceneText>): SceneText {
  const t = { ...DEFAULT_TEXT, ...saved };
  for (const [k, v] of Object.entries(OLD_SAMPLES)) if (t[k as keyof SceneText] === v) t[k as keyof SceneText] = '';
  return t;
}

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
  const [prefs, setPrefsState] = useState<Prefs>(() => {
    const p = store.get<Partial<Prefs>>('prefs', {});
    return { ...DEFAULT_PREFS, theme: store.get('theme', DEFAULT_PREFS.theme), ...p, brand: { ...DEFAULT_PREFS.brand, ...(p.brand ?? {}) } };
  });
  const setPrefs = (p: Prefs) => {
    setPrefsState(p);
    store.set('prefs', p);
  };
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const theme: 'dark' | 'light' = prefs.theme === 'system' ? (systemDark ? 'dark' : 'light') : prefs.theme;
  const setTheme = (t: 'dark' | 'light') => setPrefs({ ...prefs, theme: t });
  const [welcome, setWelcome] = useState<boolean>(() => !store.get('welcomed', false));
  const [hasLogo, setHasLogo] = useState(false);
  const [installEvt, setInstallEvt] = useState<(Event & { prompt: () => Promise<void> }) | null>(null);
  const [installed, setInstalled] = useState(() => matchMedia('(display-mode: standalone), (display-mode: window-controls-overlay)').matches);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as Event & { prompt: () => Promise<void> });
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  const [scene, setSceneState] = useState<number>(() => store.get('scene', 2));
  const [text, setText] = useState<SceneText>(() => loadText(store.get('text', {})));
  const [mirror, setMirror] = useState<boolean>(() => store.get('mirror', false));
  const [micMuted, setMicMuted] = useState(false);
  const [tab, setTab] = useState<'text' | 'pages' | 'camera' | 'effects'>('text');
  // The built-in browser: saved pages, the one showing, per-page reloads.
  const [pages, setPages] = useState<Page[]>(loadPages);
  const [activePage, setActivePage] = useState<string | null>(() => store.get('activePage', null));
  const [reloads, setReloads] = useState<Record<string, number>>({});
  const browserRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<'record' | 'library' | 'settings'>('record');
  const [customs, setCustoms] = useState<CustomScene[]>(loadCustom);
  const [editing, setEditing] = useState<{ scene: CustomScene; isNew: boolean; back: number } | null>(null);
  const [captionsOn, setCaptionsOn] = useState<boolean>(() => store.get('captions', false));
  const [capAvail, setCapAvail] = useState<CaptionAvailability | 'unknown'>('unknown');
  const [fx, setFx] = useState<FxSettings>(() => ({ ...DEFAULT_FX, ...store.get('fx', {}) }));
  const [hasBgImage, setHasBgImage] = useState(false);
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
    const docs = [document, ...(miniDoc.current ? [miniDoc.current] : [])];
    applyAccent(prefs.accent, theme === 'dark', docs);
    for (const d of docs) {
      const st = d.documentElement.style;
      st.setProperty('--blur', `${Math.round(4 + prefs.glass * 36)}px`);
      st.setProperty('--glass-a', String(0.9 - prefs.glass * 0.4));
      d.documentElement.dataset.motion = prefs.motion;
    }
    studio.comp.motion = prefs.motion;
    studio.bitrate = BITRATES[prefs.quality];
    const micOpts = { echoCancellation: prefs.echo, noiseSuppression: prefs.noise, autoGainControl: prefs.agc };
    if (JSON.stringify(micOpts) !== JSON.stringify(studio.micOpts)) {
      studio.micOpts = micOpts;
      if (studio.micLive) void studio.startMic().catch(() => {});
    }
    studio.comp.brand = { ...studio.comp.brand, ...prefs.brand };
  }, [studio, theme, prefs]);
  useEffect(() => {
    idbGet<Blob>('brandLogo').then(async (b) => {
      if (!b) return;
      studio.comp.brand.logo = await createImageBitmap(b).catch(() => null);
      setHasLogo(!!studio.comp.brand.logo);
    });
    void document.fonts.load('700 40px "Nunito"');
  }, [studio]);
  const miniDoc = useRef<Document | null>(null);
  useEffect(() => {
    studio.comp.text = text;
    store.set('text', text);
  }, [studio, text]);
  useEffect(() => {
    studio.comp.mirrorCamera = mirror;
    store.set('mirror', mirror);
  }, [studio, mirror]);
  useEffect(() => studio.audio.setMicMuted(micMuted), [studio, micMuted]);
  useEffect(() => {
    studio.comp.fx.settings = fx;
    store.set('fx', fx);
  }, [studio, fx]);
  useEffect(() => savePages(pages), [pages]);
  useEffect(() => {
    store.set('activePage', activePage);
  }, [activePage]);
  // Keep a page selected whenever there are pages.
  useEffect(() => {
    if (pages.length && !pages.some((p) => p.id === activePage)) setActivePage(pages[0].id);
    if (!pages.length && activePage) setActivePage(null);
  }, [pages, activePage]);
  useEffect(() => {
    studio.comp.customs = customs;
    saveCustom(customs);
    // Have pictures and video loops ready before a scene needs them.
    for (const c of customs) {
      if (c.bg.kind === 'video') void loadMedia(c.bg.media);
      for (const l of c.layers) if (l.media) void loadMedia(l.media);
    }
  }, [studio, customs]);
  const allScenes = [...SCENES.map((x) => ({ id: x.id, name: x.name })), ...customs.map((c) => ({ id: c.id, name: c.name }))];
  // The scene row shows your own scenes; the ready-made ones only if turned on in Settings.
  const visibleScenes = [...(prefs.showBuiltIns ? SCENES.map((x) => ({ id: x.id, name: x.name })) : []), ...customs.map((c) => ({ id: c.id, name: c.name }))];
  const visibleRef = useRef(visibleScenes);
  visibleRef.current = visibleScenes;
  // Start everyone with one example scene (once; delete it if you like).
  useEffect(() => {
    if (store.get('exampleSeeded', false)) return;
    store.set('exampleSeeded', true);
    setCustoms((l) => (l.length ? l : [exampleScene(100)]));
  }, []);
  // If the current scene was hidden, move to the first one you can see.
  useEffect(() => {
    if (!editing && visibleScenes.length && !visibleScenes.some((x) => x.id === sceneRef.current)) setScene(visibleScenes[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.showBuiltIns, customs, editing]);
  /** Where the teaching tool sits in a scene, if that scene has one. */
  /** Where the browser sits in a scene (its screen area), if it shows one. */
  const screenBox = (id: number): { x: number; y: number; w: number; h: number } | null => {
    const c = customs.find((x) => x.id === id);
    if (c) return c.layers.find((l) => l.type === 'screen' && !l.hidden) ?? null;
    const b = sceneById(id).layout.screen;
    return id < 100 && b.o > 0 ? b : null;
  };
  const sceneName = (id: number) => allScenes.find((x) => x.id === id)?.name ?? '';
  // Put the live preview back on the recorder screen after the builder.
  useEffect(() => {
    if (!editing && view === 'record') stageRef.current?.prepend(studio.comp.canvas);
  }, [studio, editing, view]);
  const openBuilder = (c?: CustomScene) => {
    const id = c?.id ?? Math.max(99, ...customs.map((x) => x.id)) + 1;
    const scene = c ? structuredClone(c) : { ...templates()[0].make(), id };
    setEditing({ scene, isNew: !c, back: scene.id === sceneRef.current ? 2 : sceneRef.current });
  };
  const closeBuilder = (goTo: number) => {
    setEditing(null);
    studio.comp.setScene(goTo);
    setSceneState(goTo);
    sceneRef.current = goTo;
  };
  const captionLang = navigator.language || 'en-US';
  // Asked only when needed (turning captions on, or recording with them on):
  // the check is heavy, so it never runs just because the page opened.
  const checkCaptions = async () => {
    const a = await captionAvailability(captionLang);
    setCapAvail(a);
    studio.captionsOn = captionsOn && a === 'ready';
    return a;
  };
  useEffect(() => {
    studio.captionsOn = captionsOn && capAvail === 'ready';
    studio.captionLang = captionLang;
    store.set('captions', captionsOn);
  }, [studio, captionsOn, capAvail, captionLang]);
  const toggleCaptions = async () => {
    if (captionsOn) return setCaptionsOn(false);
    const avail = capAvail === 'unknown' ? await checkCaptions() : capAvail;
    if (avail === 'unavailable') return say({ msg: 'Live captions need a newer Chrome with on-device speech recognition.' });
    if (avail === 'downloadable') {
      say({ msg: 'Downloading on-device speech recognition…' }, 4000);
      const ok = await installCaptions(captionLang);
      const a = await captionAvailability(captionLang);
      setCapAvail(a);
      if (!ok && a !== 'ready') return say({ msg: 'Chrome could not download speech recognition for captions.' });
    }
    setCaptionsOn(true);
  };
  useEffect(() => {
    studio.comp.fx.onStatus = () => rerender((n) => n + 1);
    idbGet<Blob>('bgImage').then(async (b) => {
      if (!b) return;
      studio.comp.fx.bgImage = await createImageBitmap(b).catch(() => null);
      setHasBgImage(!!studio.comp.fx.bgImage);
    });
  }, [studio]);
  const mini = useMiniWindow(theme);
  miniDoc.current = mini.win?.document ?? null;

  const sceneRef = useRef(scene);
  const nameRef = useRef<(id: number) => string>(() => '');
  nameRef.current = sceneName;
  const setScene = useCallback(
    (id: number) => {
      studio.comp.setScene(id);
      setSceneState(id);
      sceneRef.current = id;
      store.set('scene', id);
      studio.markScene(nameRef.current(id));
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
    if (pages.length && !studio.sharing) await captureBrowser();
    if (captionsOn && capAvail === 'unknown') await checkCaptions();
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
    const n = prefs.countdown;
    setCount(n);
    const s = sink;
    countTimers.current = [
      ...Array.from({ length: Math.max(0, n - 1) }, (_, i) => window.setTimeout(() => setCount(n - 1 - i), 900 * (i + 1))),
      window.setTimeout(() => {
        setCount(0);
        try {
          studio.startRecording(s, nameRef.current(sceneRef.current));
          setPaused(false);
          setElapsed(0);
          setPhase('recording');
        } catch {
          setPhase('idle');
          void s.abort();
          say({ msg: 'Could not start recording in this browser.' });
        }
      }, 900 * n),
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

  // ---- built-in browser ----
  /** Ask Chrome (once per session) to let the recorder record its own browser. */
  const captureBrowser = async (): Promise<boolean> => {
    const host = browserRef.current;
    if (!host) return false;
    try {
      await studio.captureElement(host, 'browser');
      return true;
    } catch (e) {
      if (e instanceof Error && e.message === 'not-this-tab') say({ msg: 'When Chrome asks what to share, choose “This tab” so the recorder can record its built-in browser.' }, 9000);
      else if (errText(e) !== 'blocked') say({ msg: 'Chrome could not record the built-in browser.' });
      return false;
    }
  };
  const addPage = (input: string) => {
    const p = makePage(input, pages.length);
    if (!p.url) return;
    setPages((l) => [...l, p]);
    setActivePage(p.id);
  };
  const openPage = (input: string) => {
    // Typing an address shows it right away and keeps it in your pages.
    const p = makePage(input, pages.length);
    if (!p.url) return;
    const existing = pages.find((x) => x.url === p.url);
    if (existing) return setActivePage(existing.id);
    setPages((l) => [...l, p]);
    setActivePage(p.id);
  };
  const pickPage = (id: string) => setActivePage(id);
  const stepPage = (d: number) => {
    if (!pages.length) return;
    const i = Math.max(0, pages.findIndex((p) => p.id === activePage));
    setActivePage(pages[(i + d + pages.length) % pages.length].id);
  };
  const reloadPage = () => activePage && setReloads((r) => ({ ...r, [activePage]: (r[activePage] ?? 0) + 1 }));

  const onBgImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const bmp = await createImageBitmap(f).catch(() => null);
    if (!bmp) return say({ msg: 'That image could not be opened.' });
    studio.comp.fx.bgImage = bmp;
    setHasBgImage(true);
    setFx((x) => ({ ...x, bg: 'replace', preset: 'image' }));
    void idbSet('bgImage', f);
  };

  // Keyboard: 1–9 or Ctrl+1–9 switch scenes; Ctrl+Shift+Enter records; Ctrl+Shift+Space pauses.
  const keys = useRef({ toggleRecord, togglePause, setScene, pickPage, stepPage, pages });
  keys.current = { toggleRecord, togglePause, setScene, pickPage, stepPage, pages };
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
      } else if (e.altKey && /^Digit[1-9]$/.test(e.code)) {
        // Alt + 1–9: switch pages (e.code, so it works with Option on a Mac too)
        const p = keys.current.pages[Number(e.code.slice(5)) - 1];
        if (p) {
          e.preventDefault();
          keys.current.pickPage(p.id);
        }
      } else if (e.altKey && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
        e.preventDefault();
        keys.current.stepPage(e.code === 'BracketRight' ? 1 : -1);
      } else if (/^[1-9]$/.test(e.key) && (mod || (!typing && !e.altKey))) {
        const target = visibleRef.current[Number(e.key) - 1];
        if (target) {
          e.preventDefault();
          keys.current.setScene(target.id);
        }
      }
    };
    const wins = [window, ...(mini.win ? [mini.win] : [])];
    wins.forEach((w) => w.addEventListener('keydown', onKey));
    return () => wins.forEach((w) => w.removeEventListener('keydown', onKey));
  }, [mini.win]);

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
        <div className="view-switch seg" role="tablist" aria-label="View">
          {(['record', 'library', 'settings'] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} className={`seg-btn press ${view === v ? 'active' : ''}`} onClick={() => setView(v)} disabled={!!editing}>
              {{ record: 'Recorder', library: 'Library', settings: 'Settings' }[v]}
            </button>
          ))}
        </div>
        <div className="title-actions">
          <button className="icon-btn press" type="button" aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
        </div>
      </header>

      {!supported && <div className="banner">This browser can’t record. Open Recorder in Google Chrome or Microsoft Edge on a computer.</div>}

      {editing && (
        <Builder
          studio={studio}
          initial={editing.scene}
          isNew={editing.isNew}
          onCancel={() => closeBuilder(editing.isNew ? editing.back : editing.scene.id)}
          onSave={(c) => {
            setCustoms((list) => (list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c]));
            studio.comp.customs = customs.some((x) => x.id === c.id) ? customs.map((x) => (x.id === c.id ? c : x)) : [...customs, c];
            closeBuilder(c.id);
            say({ msg: `Saved “${c.name}”. It’s in your scene list and the mini window.` }, 4000);
          }}
          onDelete={(id) => {
            setCustoms((list) => list.filter((x) => x.id !== id));
            studio.comp.customs = customs.filter((x) => x.id !== id);
            closeBuilder(2);
          }}
        />
      )}
      {!editing && view === 'settings' && (
        <Settings
          prefs={prefs}
          setPrefs={setPrefs}
          folderName={folder?.name ?? null}
          onChangeFolder={pickFolder}
          sceneCount={customs.length}
          hasLogo={hasLogo}
          installed={installed}
          onShowWelcome={() => setWelcome(true)}
          onLogo={async (f) => {
            const bmp = await createImageBitmap(f).catch(() => null);
            if (!bmp) return say({ msg: 'That image could not be opened.' });
            studio.comp.brand.logo = bmp;
            setHasLogo(true);
            setPrefs({ ...prefs, brand: { ...prefs.brand, logoOn: true } });
            void idbSet('brandLogo', f);
          }}
          onExportPack={async () => {
            const blob = await exportPack(customs, prefs.brand);
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'My scenes.recorderpack';
            a.click();
            say({ msg: 'Saved “My scenes.recorderpack”. Send it to another teacher to import.' });
          }}
          onImportPack={async (f) => {
            try {
              const nextId = Math.max(99, ...customs.map((x) => x.id)) + 1;
              const got = await importPack(f, nextId);
              for (const c of got.scenes) {
                if (c.bg.kind === 'video') await loadMedia(c.bg.media);
                for (const l of c.layers) if (l.media) await loadMedia(l.media);
              }
              setCustoms((l) => [...l, ...got.scenes]);
              if (got.brand && window.confirm('This pack includes a brand kit (colors, font and logo). Use it?')) {
                setPrefs({ ...prefs, brand: got.brand });
                if (got.logo) {
                  await idbSet('brandLogo', got.logo);
                  studio.comp.brand.logo = await createImageBitmap(got.logo).catch(() => null);
                  setHasLogo(!!studio.comp.brand.logo);
                }
              }
              say({ msg: `Added ${got.scenes.length} scene${got.scenes.length === 1 ? '' : 's'} from “${f.name}”.` });
            } catch {
              say({ msg: 'That file is not a Recorder scene pack.' });
            }
          }}
        />
      )}
      {welcome && (
        <Welcome
          name={text.name}
          role={text.role}
          onNames={(name, role) => setText((t) => ({ ...t, name, role }))}
          camOk={studio.cameraLive}
          micOk={studio.micLive}
          onAllow={async () => {
            await studio.startCamera().catch(() => {});
            await studio.startMic().catch(() => {});
            refreshDevices();
          }}
          folderName={folder?.name ?? null}
          onFolder={pickFolder}
          canInstall={!!installEvt}
          installed={installed}
          onInstall={() => void installEvt?.prompt()}
          onDone={() => {
            setWelcome(false);
            store.set('welcomed', true);
            setView('record');
          }}
        />
      )}
      {!editing && view === 'library' && <Library folder={folder} onChooseFolder={pickFolder} say={(m) => say({ msg: m })} />}
      <main className="body" hidden={view !== 'record' || !!editing}>
        <section className="stage-col" aria-label="Preview">
          <div className="stage-wrap">
            <PageToolbar pages={pages} active={activePage} onPick={pickPage} onOpen={openPage} onAdd={addPage} onReload={reloadPage} />
            <div className="stage" ref={stageRef}>
              <BrowserHost
                ref={browserRef}
                pages={pages}
                active={activePage}
                reloads={reloads}
                behind={!screenBox(scene)}
                captured={studio.sharing}
                onCapture={() => void captureBrowser()}
                style={(() => {
                  const b = screenBox(scene);
                  return b ? { left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` } : undefined;
                })()}
              />
              {phase === 'countdown' && count > 0 && (
                <div className="countdown" aria-live="assertive">
                  <span key={count}>{count}</span>
                </div>
              )}
            </div>

            <div className="controls">
              <div className="controls-inner" role="toolbar" aria-label="Recording controls">
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
                {miniSupported() && (
                  <button className={`tbtn press ${mini.win ? 'on' : ''}`} type="button" aria-pressed={!!mini.win} onClick={mini.win ? mini.close : mini.open} aria-label="Pop out mini controls" title="Mini controls that stay on top of other apps">
                    <IconPip />
                  </button>
                )}
              </div>
            </div>
          </div>

          <nav className="scenes" aria-label="Scenes">
            <div className="scenes-head">
              <h2>Scenes</h2>
              <span className="hint">Click, or press 1–9, even while recording</span>
            </div>
            <div className="strip scroll">
              {(prefs.showBuiltIns ? SCENES : []).map((s) => (
                <button key={s.id} type="button" className={`scene-card press ${s.id === scene ? 'active' : ''}`} aria-pressed={s.id === scene} onClick={() => setScene(s.id)}>
                  <Thumb layout={s.layout} />
                  <div className="scene-meta">
                    <span>{s.name}</span>
                    {visibleScenes.findIndex((v) => v.id === s.id) < 9 && <span className="key">{visibleScenes.findIndex((v) => v.id === s.id) + 1}</span>}
                  </div>
                </button>
              ))}
              {customs.map((c) => (
                <div key={c.id} className="scene-card-wrap">
                  <button type="button" className={`scene-card press ${c.id === scene ? 'active' : ''}`} aria-pressed={c.id === scene} onClick={() => setScene(c.id)}>
                    <CustomThumb scene={c} />
                    <div className="scene-meta">
                      <span>{c.name}</span>
                      {visibleScenes.findIndex((v) => v.id === c.id) < 9 && <span className="key">{visibleScenes.findIndex((v) => v.id === c.id) + 1}</span>}
                    </div>
                  </button>
                  <button type="button" className="edit-scene press" aria-label={`Edit ${c.name}`} title="Edit scene" onClick={() => openBuilder(c)} disabled={phase !== 'idle'}>
                    ✎
                  </button>
                </div>
              ))}
              <button type="button" className="scene-card new-scene press" onClick={() => openBuilder()} disabled={phase !== 'idle'}>
                <span aria-hidden="true">+</span>
                New scene
              </button>
            </div>
          </nav>
        </section>

        <aside className="panel scroll" aria-label="Settings">
          <div className="tabs" role="tablist">
            {(['text', 'pages', 'camera', 'effects'] as const).map((t) => (
              <button key={t} role="tab" type="button" aria-selected={tab === t} className={`tab press ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                {{ text: 'Text', pages: 'Pages', camera: 'Camera', effects: 'Effects' }[t]}
              </button>
            ))}
          </div>

          {tab === 'text' && (
            <div className="section">
              <h2 className="h-section">Scene text</h2>
              <div className="note">Only what you type here shows up in your video. Leave anything blank to hide it.</div>
              {(
                [
                  ['Everywhere', [
                    ['title', 'Title', 'Fills {title} in your text layers'],
                    ['name', 'Your name', 'Fills {name}'],
                    ['role', 'Subtitle', 'Fills {role}'],
                  ]],
                  ['Try this', [
                    ['problemTitle', 'Heading', 'Big text at the top'],
                    ['problem', 'Problem', 'In the white box, next to the timer'],
                  ]],
                  ['Be right back', [
                    ['brbTitle', 'Heading', 'Big centered text'],
                    ['brb', 'Note', 'Smaller text underneath'],
                  ]],
                  ['Outro', [
                    ['outroTitle', 'Heading', 'Big text beside your camera'],
                    ['outro', 'Message', 'Smaller text underneath'],
                  ]],
                ] as [string, [keyof SceneText, string, string][]][]
              )
                .filter(([group]) => prefs.showBuiltIns || group === 'Everywhere')
                .map(([group, fields]) => (
                <div key={group} className="text-group">
                  <div className="sub">{group}</div>
                  {fields.map(([k, label, hint]) => (
                    <label key={k} className="field">
                      {label}
                      <input value={text[k]} placeholder={hint} onChange={setField(k)} />
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}

          {tab === 'pages' && <PagesPanel pages={pages} active={activePage} setPages={setPages} onPick={pickPage} onAdd={addPage} />}

          {tab === 'camera' && (
            <div className="section">
              <h2 className="h-section">Camera and mic</h2>
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
            </div>
          )}

          {tab === 'effects' && (
            <div className="section">
              <h2 className="h-section">Camera effects</h2>
              <div className="sub">Background</div>
              <div className="seg" role="radiogroup" aria-label="Background">
                {(['none', 'blur', 'replace', 'remove'] as BgMode[]).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={fx.bg === m} className={`seg-btn press ${fx.bg === m ? 'active' : ''}`} onClick={() => setFx({ ...fx, bg: m })}>
                    {{ none: 'Off', blur: 'Blur', replace: 'Replace', remove: 'Remove' }[m]}
                  </button>
                ))}
              </div>
              {fx.bg === 'replace' && (
                <div className="swatches" role="radiogroup" aria-label="Replace with">
                  {(['indigo', 'sunset', 'slate'] as BgPreset[]).map((p) => (
                    <button key={p} type="button" role="radio" aria-checked={fx.preset === p} aria-label={p} className={`swatch press bg-${p} ${fx.preset === p ? 'active' : ''}`} onClick={() => setFx({ ...fx, preset: p })} />
                  ))}
                  {hasBgImage && (
                    <button type="button" role="radio" aria-checked={fx.preset === 'image'} className={`swatch press bg-image ${fx.preset === 'image' ? 'active' : ''}`} onClick={() => setFx({ ...fx, preset: 'image' })}>
                      Photo
                    </button>
                  )}
                  <label className="swatch upload press">
                    + Image
                    <input type="file" accept="image/*" onChange={onBgImage} />
                  </label>
                </div>
              )}
              <div className="note">
                {fx.bg === 'none' && 'Your real background.'}
                {fx.bg === 'blur' && 'Softly blurs your room, like Google Meet.'}
                {fx.bg === 'replace' && 'Swaps your room for a backdrop or your own photo.'}
                {fx.bg === 'remove' && 'Cuts you out so you float over whatever is behind your camera bubble.'}
                {' '}The Presenter scene always removes your background.
              </div>
              {studio.comp.fx.status === 'loading' && <div className="note">Loading effects… (first time only)</div>}
              {studio.comp.fx.status === 'failed' && <div className="note">Effects could not start on this computer.</div>}
              <div className="divider" />
              {(
                [
                  ['autoFrame', 'Auto-framing', 'Keeps you centered as you move'],
                  ['lightFix', 'Light fix', 'Brightens a dim room'],
                ] as const
              ).map(([k, label, note]) => (
                <div className="row" key={k}>
                  <div className="tile-main">
                    <div className="tile-title">{label}</div>
                    <div className="note">{note}</div>
                  </div>
                  <button className="switch" type="button" role="switch" aria-checked={fx[k]} aria-label={label} onClick={() => setFx({ ...fx, [k]: !fx[k] })}>
                    <i />
                  </button>
                </div>
              ))}
              <div className="note">All effects run on this computer. Nothing is uploaded.</div>
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
          <div className="row">
            <div className="tile-main">
              <div className="tile-title">Live captions</div>
              <div className="note">
                {capAvail === 'unavailable'
                  ? 'Needs a newer Chrome with on-device speech recognition.'
                  : capAvail === 'downloadable'
                    ? 'Turning on downloads Chrome’s on-device speech model once.'
                    : 'Written on this computer as you talk, saved next to the video.'}
              </div>
            </div>
            <button className="switch" type="button" role="switch" aria-checked={captionsOn && capAvail !== 'unavailable'} aria-label="Live captions" disabled={capAvail === 'unavailable' || phase !== 'idle'} onClick={toggleCaptions}>
              <i />
            </button>
          </div>
        </aside>
      </main>

      {mini.win && (
        <MiniPanel
          win={mini.win}
          scene={scene}
          scenes={visibleScenes}
          setScene={setScene}
          phase={phase}
          paused={paused}
          elapsed={fmt(elapsed)}
          count={count}
          onRecord={toggleRecord}
          onPause={togglePause}
          pages={pages.map((p) => ({ id: p.id, title: p.title }))}
          activePage={activePage}
          onPickPage={pickPage}
        />
      )}

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
      <div style={boxStyle(layout.screen2, { background: '#ffffff' })} />
      <div style={boxStyle(layout.tool, { background: '#e3f4ea' })} />
      {layout.card && <div style={{ inset: 0, background: CARD_BG[layout.card] }} />}
      <div style={boxStyle(layout.camera, { background: 'linear-gradient(165deg,#6b5546,#2f2622)', boxShadow: layout.camera.ring ? '0 0 0 2px #fff' : 'none' })} />
      {layout.title && <div style={{ left: '8%', bottom: '14%', width: '50%', height: '10%', borderRadius: 3, background: 'rgba(255,255,255,.9)' }} />}
      {layout.lower && <div style={{ left: '5%', bottom: '8%', width: '40%', height: '14%', borderRadius: 4, background: 'rgba(20,22,40,.75)' }} />}
    </div>
  );
}

// Thumbnail of a custom scene: its background and layers as simple boxes.
const BG_CSS = (c: CustomScene) =>
  c.bg.kind === 'color' ? c.bg.value : c.bg.kind === 'gradient' ? `linear-gradient(135deg,${c.bg.from},${c.bg.to})` : c.bg.kind === 'aurora' ? 'linear-gradient(135deg,#5b67d8,#c45bd8 60%,#3fb8c9)' : '#222';
const LAYER_CSS: Record<string, string> = { camera: 'linear-gradient(165deg,#6b5546,#2f2622)', screen: '#eef0fb', screen2: '#ffffff', tool: '#e3f4ea', image: '#ffd8a8', clip: '#3b1f4d', timer: '#fff1e6' };
function CustomThumb({ scene }: { scene: CustomScene }) {
  return (
    <div className="thumb" aria-hidden="true" style={{ background: BG_CSS(scene) }}>
      {scene.layers.map((l) =>
        l.hidden ? null : (
          <div
            key={l.id}
            style={{
              left: `${l.x * 100}%`,
              top: `${l.y * 100}%`,
              width: `${l.w * 100}%`,
              height: `${l.h * 100}%`,
              opacity: l.opacity,
              clipPath: l.type === 'text' || (l.type === 'camera' && l.cutout) ? undefined : cssClip(l.shape, l.round),
              background: l.type === 'text' ? 'transparent' : l.type === 'shape' ? l.fill : LAYER_CSS[l.type],
            }}
          >
            {l.type === 'text' && <div style={{ height: '40%', marginTop: '10%', borderRadius: 2, background: l.color ?? '#fff', opacity: 0.85 }} />}
          </div>
        ),
      )}
    </div>
  );
}
