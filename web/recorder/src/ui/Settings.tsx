// Settings: recording quality, audio clean-up, appearance (accent color,
// glass, motion), brand kit, scene packs, shortcuts and about.

import { useState } from 'react';
import type { BrandSettings } from '../lib/packs';
import { SEEDS } from '../lib/theme';

export interface Prefs {
  theme: 'dark' | 'light' | 'system';
  accent: string;
  motion: 'expressive' | 'standard' | 'reduced';
  glass: number; // 0..1
  countdown: 0 | 3 | 5 | 10;
  quality: 'standard' | 'high' | 'max';
  noise: boolean;
  echo: boolean;
  agc: boolean;
  brand: BrandSettings;
  /** Show the 11 ready-made scenes next to your own. */
  showBuiltIns: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'dark',
  accent: '#4a55a8',
  motion: 'expressive',
  glass: 0.6,
  countdown: 3,
  quality: 'high',
  noise: true,
  echo: true,
  agc: true,
  brand: { bar: '#141628', accent: '#bac3ff', text: '#ffffff', font: 'modern', logoOn: false },
  showBuiltIns: false,
};

export const BITRATES: Record<Prefs['quality'], number> = { standard: 5_000_000, high: 8_000_000, max: 14_000_000 };

type Section = 'recording' | 'audio' | 'appearance' | 'brand' | 'packs' | 'shortcuts' | 'about';
const SECTIONS: [Section, string][] = [
  ['recording', 'Recording'],
  ['audio', 'Audio'],
  ['appearance', 'Appearance'],
  ['brand', 'Brand kit'],
  ['packs', 'Scene packs'],
  ['shortcuts', 'Shortcuts'],
  ['about', 'About'],
];

export function Settings(props: {
  prefs: Prefs;
  setPrefs: (p: Prefs) => void;
  folderName: string | null;
  onChangeFolder: () => void;
  sceneCount: number;
  onExportPack: () => void;
  onImportPack: (f: File) => void;
  hasLogo: boolean;
  onLogo: (f: File) => void;
  onShowWelcome: () => void;
  installed: boolean;
}) {
  const { prefs, setPrefs, folderName, onChangeFolder, sceneCount, onExportPack, onImportPack, hasLogo, onLogo, onShowWelcome, installed } = props;
  const [sec, setSec] = useState<Section>('recording');
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs({ ...prefs, [k]: v });
  const setBrand = <K extends keyof BrandSettings>(k: K, v: BrandSettings[K]) => setPrefs({ ...prefs, brand: { ...prefs.brand, [k]: v } });

  const seg = <T extends string | number>(value: T, options: [T, string][], on: (v: T) => void, label: string) => (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} className={`seg-btn press ${value === v ? 'active' : ''}`} onClick={() => on(v)}>
          {l}
        </button>
      ))}
    </div>
  );
  const sw = (on: boolean, flip: () => void, label: string, note: string) => (
    <div className="row">
      <div className="tile-main">
        <div className="tile-title">{label}</div>
        <div className="note">{note}</div>
      </div>
      <button className="switch" type="button" role="switch" aria-checked={on} aria-label={label} onClick={flip}>
        <i />
      </button>
    </div>
  );

  return (
    <div className="settings">
      <nav className="settings-nav" aria-label="Settings sections">
        {SECTIONS.map(([id, label]) => (
          <button key={id} type="button" className={`nav-item press ${sec === id ? 'active' : ''}`} aria-current={sec === id ? 'page' : undefined} onClick={() => setSec(id)}>
            {label}
          </button>
        ))}
      </nav>

      <section className="settings-main scroll">
        {sec === 'recording' && (
          <>
            <h1 className="h-page">Recording</h1>
            <div className="card">
              <div className="row">
                <div className="tile-main">
                  <div className="tile-title">Save recordings to</div>
                  <div className="note">{folderName ?? 'Not chosen yet (you will be asked the first time you record)'}</div>
                </div>
                <button className="small-btn press tonal" type="button" onClick={onChangeFolder}>
                  Change folder
                </button>
              </div>
            </div>
            <div className="card">
              <div className="tile-title">Quality</div>
              {seg(prefs.quality, [['standard', 'Standard'], ['high', 'High'], ['max', 'Maximum']], (v) => set('quality', v), 'Quality')}
              <div className="note">1080p in every case. Higher quality makes sharper text and bigger files (about 40, 60 or 100 MB per minute).</div>
              <div className="tile-title">Countdown before recording</div>
              {seg(prefs.countdown, [[0, 'Off'], [3, '3 sec'], [5, '5 sec'], [10, '10 sec']], (v) => set('countdown', v), 'Countdown')}
            </div>
            <div className="card">
              {sw(prefs.showBuiltIns, () => set('showBuiltIns', !prefs.showBuiltIns), 'Show ready-made scenes', 'Adds 11 built-in scenes (Welcome, Lesson, Presenter, Try this…) next to your own.')}
            </div>
          </>
        )}

        {sec === 'audio' && (
          <>
            <h1 className="h-page">Audio</h1>
            <div className="card">
              {sw(prefs.noise, () => set('noise', !prefs.noise), 'Noise suppression', 'Removes fans, typing and hallway noise.')}
              {sw(prefs.echo, () => set('echo', !prefs.echo), 'Echo cancellation', 'Stops your speakers from echoing into the mic.')}
              {sw(prefs.agc, () => set('agc', !prefs.agc), 'Auto volume leveling', 'Evens out loud and quiet moments.')}
              <div className="note">To record sound from a video or app, tick “Share audio” in Chrome’s share picker.</div>
            </div>
          </>
        )}

        {sec === 'appearance' && (
          <>
            <h1 className="h-page">Appearance</h1>
            <div className="card">
              <div className="tile-title">Theme</div>
              {seg(prefs.theme, [['light', 'Light'], ['dark', 'Dark'], ['system', 'Match system']], (v) => set('theme', v), 'Theme')}
              <div className="tile-title">Accent color</div>
              <div className="seed-row">
                {SEEDS.map((s) => (
                  <button key={s.hex} type="button" className={`seed press ${prefs.accent === s.hex ? 'active' : ''}`} aria-label={s.name} aria-pressed={prefs.accent === s.hex} onClick={() => set('accent', s.hex)}>
                    <i style={{ background: s.hex }} />
                  </button>
                ))}
                <label className="seed custom" title="Any color">
                  <input type="color" aria-label="Pick any accent color" value={prefs.accent} onChange={(e) => set('accent', e.target.value)} />
                </label>
              </div>
              <div className="note">The whole app re-colors itself from this one color, Material You style.</div>
              <div className="tile-title">Glass</div>
              <input type="range" aria-label="Glass intensity" min={0} max={1} step={0.05} value={prefs.glass} onChange={(e) => set('glass', +e.target.value)} />
              <div className="glass-demo">
                <i />
                <div>Frosted panel</div>
              </div>
              <div className="tile-title">Motion</div>
              {seg(prefs.motion, [['expressive', 'Expressive'], ['standard', 'Standard'], ['reduced', 'Reduced']], (v) => set('motion', v), 'Motion')}
              <div className="note">Expressive uses springy, bouncy animations, in the app and between scenes. Reduced turns motion off.</div>
            </div>
          </>
        )}

        {sec === 'brand' && (
          <>
            <h1 className="h-page">Brand kit</h1>
            <div className="note">Your class look for the name bar, plus an optional logo on every scene.</div>
            <div className="card">
              <div className="tile-title">Colors</div>
              <div className="color-row">
                {(
                  [
                    ['bar', 'Bar'],
                    ['accent', 'Accent'],
                    ['text', 'Text'],
                  ] as const
                ).map(([k, l]) => (
                  <label key={k} className="color-pick">
                    <input type="color" aria-label={`${l} color`} value={prefs.brand[k]} onChange={(e) => setBrand(k, e.target.value)} />
                    {l}
                  </label>
                ))}
              </div>
              <div className="tile-title">Font</div>
              {seg(prefs.brand.font, [['modern', 'Modern'], ['rounded', 'Friendly rounded'], ['serif', 'Classic serif']], (v) => setBrand('font', v), 'Font')}
              <div className="row">
                <label className="small-btn press tonal upload-inline">
                  {hasLogo ? 'Change logo' : 'Upload logo'}
                  <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && onLogo(e.target.files[0])} />
                </label>
                <span className="note">PNG or SVG with a transparent background works best.</span>
              </div>
              {hasLogo && sw(prefs.brand.logoOn, () => setBrand('logoOn', !prefs.brand.logoOn), 'Show logo on every scene', 'Top-right corner of the recording.')}
              <div className="tile-title">Preview</div>
              <div className={`brand-preview font-${prefs.brand.font}`}>
                <div className="bar" style={{ background: prefs.brand.bar }}>
                  <i style={{ background: prefs.brand.accent }} />
                  <div style={{ color: prefs.brand.text }}>
                    <b>Name</b>
                    <span>Subtitle</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {sec === 'packs' && (
          <>
            <h1 className="h-page">Scene packs</h1>
            <div className="note">Share your scenes, their pictures and videos, and your brand kit with other teachers as one file.</div>
            <div className="card">
              <div className="row">
                <div className="tile-main">
                  <div className="tile-title">Export my scenes</div>
                  <div className="note">
                    {sceneCount} custom scene{sceneCount === 1 ? '' : 's'} · brand kit
                  </div>
                </div>
                <button className="small-btn press" type="button" onClick={onExportPack} disabled={sceneCount === 0}>
                  Export pack
                </button>
              </div>
              <div className="divider" />
              <div className="row">
                <div className="tile-main">
                  <div className="tile-title">Import a pack</div>
                  <div className="note">From another teacher. Their scenes are added next to yours.</div>
                </div>
                <label className="small-btn press tonal upload-inline">
                  Choose file
                  <input type="file" accept=".recorderpack,.json,application/json" onChange={(e) => e.target.files?.[0] && onImportPack(e.target.files[0])} />
                </label>
              </div>
            </div>
          </>
        )}

        {sec === 'shortcuts' && (
          <>
            <h1 className="h-page">Keyboard shortcuts</h1>
            <div className="note">These work while the recorder or its mini window is in front. On a Mac, use Command instead of Ctrl.</div>
            <div className="card">
              {[
                ['Switch to scene 1–9', '1 … 9  or  Ctrl + 1 … 9'],
                ['Start or stop recording', 'Ctrl + Shift + Enter'],
                ['Pause or resume', 'Ctrl + Shift + Space'],
                ['Next or previous slide', '→  /  ←'],
                ['Scene builder: nudge a layer', 'Arrow keys (Shift = bigger steps)'],
                ['Scene builder: delete a layer', 'Delete'],
              ].map(([what, keys]) => (
                <div key={what} className="row key-row">
                  <span className="tile-main">{what}</span>
                  <kbd>{keys}</kbd>
                </div>
              ))}
            </div>
          </>
        )}

        {sec === 'about' && (
          <>
            <h1 className="h-page">About</h1>
            <div className="card">
              <div className="tile-title">Recorder</div>
              <div className="note">{installed ? 'Installed as an app. ' : 'Install it from the address bar for its own window and icon. '}Works offline. Updates arrive automatically.</div>
              <div className="tip">
                <b>Your recordings never leave this computer.</b> The camera, screen, effects and captions are all processed here. Nothing is uploaded.
              </div>
              <div className="note">Works in Chrome and Microsoft Edge on Googlebook, Chromebook, Windows and Mac. Built with open-source libraries under MIT, Apache-2.0 and BSD licenses.</div>
              <button className="small-btn press tonal" type="button" onClick={onShowWelcome}>
                Show the welcome tour again
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
