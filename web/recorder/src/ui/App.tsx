import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { SCENES, showsScreen, type Box, type Layout } from '../engine/scenes';
import { DEFAULT_FX, type BgMode, type BgPreset, type FxSettings } from '../engine/effects';
import { idbGet, idbSet } from '../lib/idb';
import { MiniPanel, miniSupported, useMiniWindow } from './MiniWindow';
import { Library } from './Library';
import { Builder } from './Builder';
import { cssClip, loadCustom, loadMedia, saveCustom, templates, type CustomScene } from '../engine/custom';
import { captionAvailability, installCaptions, type CaptionAvailability } from '../engine/captions';
import { addFileTool, forgetTool, linkTool, loadTools, saveTools, toolUrl, type Tool } from '../lib/tools';
import type { SceneText } from '../engine/compositor';
import type { DeviceLists } from '../engine/studio';
import { Studio } from '../engine/studio';
import type { Sink } from '../engine/recorder';
import { canPickFolder, chooseFolder, downloadSink, ensureWritable, fileNameFor, folderSink, savedFolder } from '../lib/folder';
import { IconCamera, IconClose, IconFolder, IconMic, IconMoon, IconPause, IconPip, IconPlay, IconScreen, IconSun } from './icons';

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
  const [tab, setTab] = useState<'text' | 'sources' | 'effects' | 'content'>('text');
  const [tools, setTools] = useState<Tool[]>(loadTools);
  const [view, setView] = useState<'record' | 'library'>('record');
  const [customs, setCustoms] = useState<CustomScene[]>(loadCustom);
  const [editing, setEditing] = useState<{ scene: CustomScene; isNew: boolean; back: number } | null>(null);
  const [captionsOn, setCaptionsOn] = useState<boolean>(() => store.get('captions', false));
  const [capAvail, setCapAvail] = useState<CaptionAvailability | 'unknown'>('unknown');
  const [activeTool, setActiveTool] = useState<{ tool: Tool; url: string } | null>(null);
  const [linkDraft, setLinkDraft] = useState('');
  const toolHostRef = useRef<HTMLDivElement>(null);
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
  useEffect(() => {
    studio.comp.fx.settings = fx;
    store.set('fx', fx);
  }, [studio, fx]);
  useEffect(() => saveTools(tools), [tools]);
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
  const sceneName = (id: number) => allScenes.find((x) => x.id === id)?.name ?? '';
  // Put the live preview back on the recorder screen after the builder.
  useEffect(() => {
    if (!editing && view === 'record') stageRef.current?.prepend(studio.comp.canvas);
  }, [studio, editing, view]);
  const openBuilder = (c?: CustomScene) => {
    const id = c?.id ?? Math.max(99, ...customs.map((x) => x.id)) + 1;
    const scene = c ? structuredClone(c) : { ...templates()[1].make(), id };
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
    studio.comp.slides.onChange = () => rerender((n) => n + 1);
    studio.comp.fx.onStatus = () => rerender((n) => n + 1);
    idbGet<Blob>('bgImage').then(async (b) => {
      if (!b) return;
      studio.comp.fx.bgImage = await createImageBitmap(b).catch(() => null);
      setHasBgImage(!!studio.comp.fx.bgImage);
    });
  }, [studio]);
  const mini = useMiniWindow(theme);

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
  const toggleShare = async () => {
    if (studio.sharing) return studio.stopShare();
    try {
      await studio.shareScreen();
      if (!showsScreen(scene)) setScene(2);
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
    setCount(3);
    const s = sink;
    countTimers.current = [
      window.setTimeout(() => setCount(2), 900),
      window.setTimeout(() => setCount(1), 1800),
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

  // ---- content: slides and teaching tools ----
  const slides = studio.comp.slides;
  const onPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      await slides.open(f);
      if (!showsScreen(scene) || scene === 8) setScene(2);
      say({ msg: `Showing “${f.name}”. Use ← → or the buttons to change slides.` }, 4000);
    } catch {
      say({ msg: 'That PDF could not be opened.' });
    }
  };

  const openTool = async (t: Tool) => {
    const url = await toolUrl(t);
    if (!url) return say({ msg: 'That file is no longer available. Add it again.' });
    if (activeTool?.tool.kind === 'file') URL.revokeObjectURL(activeTool.url);
    setActiveTool({ tool: t, url });
    setScene(7);
    if (!studio.comp.tool.active) {
      // Wait for the tool panel to be on screen, then ask Chrome to record it.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      void captureTool();
    }
  };
  const captureTool = async () => {
    const host = toolHostRef.current;
    if (!host) return;
    try {
      await studio.captureElement(host);
    } catch (e) {
      if (e instanceof Error && e.message === 'not-this-tab') say({ msg: 'When Chrome asks what to share, choose “This tab”. Then click “Show this tool in the recording”.' }, 9000);
      else if (errText(e) !== 'blocked') say({ msg: 'Chrome could not record the tool. Try Share screen and pick its tab instead.' });
    }
  };
  const closeTool = () => {
    if (activeTool?.tool.kind === 'file') URL.revokeObjectURL(activeTool.url);
    setActiveTool(null);
    studio.stopToolCapture();
  };
  const onToolFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    const added = await Promise.all(files.map(addFileTool));
    if (added.length) {
      setTools((l) => [...l, ...added]);
      void openTool(added[added.length - 1]);
    }
  };
  const addLink = () => {
    const v = linkDraft.trim();
    if (!v) return;
    try {
      const t = linkTool(v);
      setTools((l) => [...l, t]);
      setLinkDraft('');
      void openTool(t);
    } catch {
      say({ msg: 'That does not look like a web address.' });
    }
  };
  const removeTool = (t: Tool) => {
    if (activeTool?.tool.id === t.id) closeTool();
    setTools((l) => l.filter((x) => x.id !== t.id));
    void forgetTool(t);
  };

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
  const keys = useRef({ toggleRecord, togglePause, setScene, slides });
  keys.current = { toggleRecord, togglePause, setScene, slides };
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
      } else if (!typing && keys.current.slides.active && ['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        void (e.key === 'ArrowRight' || e.key === 'PageDown' ? keys.current.slides.next() : keys.current.slides.prev());
      } else if (/^[1-9]$/.test(e.key) && (mod || (!typing && !e.altKey))) {
        const id = Number(e.key);
        if (SCENES.some((s) => s.id === id)) {
          e.preventDefault();
          keys.current.setScene(id);
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
          {(['record', 'library'] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} className={`seg-btn press ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>
              {v === 'record' ? 'Recorder' : 'Library'}
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
      {!editing && view === 'library' && <Library folder={folder} onChooseFolder={pickFolder} say={(m) => say({ msg: m })} />}
      <main className="body" hidden={view !== 'record' || !!editing}>
        <section className="stage-col" aria-label="Preview">
          <div className="stage-wrap">
            <div className="stage" ref={stageRef}>
              {activeTool && (
                // Stays mounted (under the preview) in other scenes so Chrome keeps recording it.
                <div className={`tool-host ${scene === 7 ? '' : 'behind'}`} ref={toolHostRef} aria-hidden={scene !== 7}>
                  <iframe
                    title={activeTool.tool.name}
                    src={activeTool.url}
                    sandbox={activeTool.tool.kind === 'file' ? 'allow-scripts allow-forms allow-modals allow-popups allow-downloads' : 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads'}
                    allow="autoplay; fullscreen; clipboard-write"
                  />
                  {!studio.comp.tool.active && (
                    <button type="button" className="tool-capture press" onClick={captureTool}>
                      Show this tool in the recording
                    </button>
                  )}
                </div>
              )}
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
              <span className="hint">Click, or press 1–9 (scenes 10+ in the mini window), even while recording</span>
            </div>
            <div className="strip scroll">
              {SCENES.map((s) => (
                <button key={s.id} type="button" className={`scene-card press ${s.id === scene ? 'active' : ''}`} aria-pressed={s.id === scene} onClick={() => setScene(s.id)}>
                  <Thumb layout={s.layout} />
                  <div className="scene-meta">
                    <span>{s.name}</span>
                    {s.id <= 9 && <span className="key">{s.id}</span>}
                  </div>
                </button>
              ))}
              {customs.map((c) => (
                <div key={c.id} className="scene-card-wrap">
                  <button type="button" className={`scene-card press ${c.id === scene ? 'active' : ''}`} aria-pressed={c.id === scene} onClick={() => setScene(c.id)}>
                    <CustomThumb scene={c} />
                    <div className="scene-meta">
                      <span>{c.name}</span>
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
            {(['text', 'sources', 'effects', 'content'] as const).map((t) => (
              <button key={t} role="tab" type="button" aria-selected={tab === t} className={`tab press ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                {{ text: 'Text', sources: 'Sources', effects: 'Effects', content: 'Content' }[t]}
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
              <div className="tile">
                <div className="tile-main">
                  <div className="tile-title">Second screen</div>
                  <div className="tile-note">{studio.comp.screen2.active ? 'Shared · used in Two screens' : 'For the Two screens scene'}</div>
                </div>
                <button className="text-btn press" type="button" onClick={async () => {
                  if (studio.comp.screen2.active) return studio.stopSecond();
                  try {
                    await studio.shareSecond();
                    setScene(8);
                  } catch {
                    /* picker closed */
                  }
                }}>
                  {studio.comp.screen2.active ? 'Stop' : 'Share'}
                </button>
              </div>
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

          {tab === 'content' && (
            <div className="section">
              <h2 className="h-section">Slides</h2>
              <div className="note">Upload a PDF, or PowerPoint, Google Slides or Keynote saved as PDF. It takes the place of the screen share in your scenes.</div>
              <label className="upload-btn press tonal">
                Upload slides (PDF)
                <input type="file" accept=".pdf,application/pdf" onChange={onPdf} />
              </label>
              {slides.active && (
                <>
                  <div className="tile selected">
                    <div className="pdf-badge" aria-hidden="true">PDF</div>
                    <div className="tile-main">
                      <div className="tile-title">{slides.name}</div>
                      <div className="tile-note">
                        Slide {slides.page} of {slides.pages}
                      </div>
                    </div>
                    <button className="round-btn press" type="button" aria-label="Previous slide" onClick={slides.prev} disabled={slides.page <= 1}>
                      ‹
                    </button>
                    <button className="round-btn press primary" type="button" aria-label="Next slide" onClick={slides.next} disabled={slides.page >= slides.pages}>
                      ›
                    </button>
                  </div>
                  <button className="text-btn press" type="button" onClick={() => slides.close()}>
                    Go back to screen share
                  </button>
                </>
              )}
              <div className="divider" />
              <h2 className="h-section">Teaching tools</h2>
              <div className="note">Add HTML files from your computer or paste a link. They run inside the recorder in the Tool + me scene, and you can click and type in them while you record.</div>
              <label className="upload-btn press">
                Upload HTML files
                <input type="file" accept=".html,.htm,text/html" multiple onChange={onToolFiles} />
              </label>
              {tools.length === 0 && <div className="empty">No tools yet. Upload an HTML file or add a link below.</div>}
              {tools.map((t) => (
                <div key={t.id} className={`tile ${activeTool?.tool.id === t.id ? 'selected' : ''}`}>
                  <button type="button" className="tile-btn" onClick={() => openTool(t)}>
                    <div className="tool-badge" aria-hidden="true">{t.name[0]}</div>
                    <div className="tile-main">
                      <div className="tile-title">{t.name}</div>
                      <div className="tile-note">{t.kind === 'file' ? `${t.src} · on this computer` : t.src.replace(/^https?:\/\//, '')}</div>
                    </div>
                  </button>
                  <button className="icon-btn press" type="button" aria-label={`Remove ${t.name}`} onClick={() => removeTool(t)}>
                    <IconClose />
                  </button>
                </div>
              ))}
              <label className="field">
                Add a tool by link
                <div className="row">
                  <input type="url" placeholder="https://…" value={linkDraft} onChange={(e) => setLinkDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLink()} />
                  <button className="small-btn press" type="button" onClick={addLink}>
                    Add
                  </button>
                </div>
              </label>
              {activeTool && (
                <button className="text-btn press" type="button" onClick={closeTool}>
                  Close “{activeTool.tool.name}”
                </button>
              )}
              <div className="note">Some websites refuse to run inside other apps. If one stays blank, share its tab with Share screen instead.</div>
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
          scenes={allScenes}
          setScene={setScene}
          phase={phase}
          paused={paused}
          elapsed={fmt(elapsed)}
          count={count}
          onRecord={toggleRecord}
          onPause={togglePause}
          slides={slides.active ? { page: slides.page, pages: slides.pages, next: slides.next, prev: slides.prev } : null}
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
