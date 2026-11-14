// Scene builder. The preview is the real recording engine drawing the scene
// you are editing; boxes on top let you select, drag and resize layers.

import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { cssClip, loadMedia, newLayer, SHAPES, storeMedia, templates, type Background, type CustomScene, type Layer, type LayerType } from '../engine/custom';
import type { Studio } from '../engine/studio';
import { IconClose } from './icons';

const ADD: { type: LayerType; label: string; letter: string }[] = [
  { type: 'camera', label: 'Camera', letter: 'C' },
  { type: 'screen', label: 'Screen', letter: 'S' },
  { type: 'screen2', label: '2nd screen', letter: '2' },
  { type: 'tool', label: 'Tool', letter: 'H' },
  { type: 'text', label: 'Text', letter: 'T' },
  { type: 'image', label: 'Picture', letter: 'P' },
  { type: 'clip', label: 'Video loop', letter: 'V' },
  { type: 'shape', label: 'Shape', letter: '◆' },
  { type: 'timer', label: 'Timer', letter: '⏱' },
];
const KIND: Record<LayerType, string> = {
  camera: 'Camera',
  screen: 'Screen, tab, window or slides',
  screen2: 'Second screen',
  tool: 'Teaching tool',
  text: 'Text',
  image: 'Picture',
  clip: 'Video loop',
  shape: 'Shape',
  timer: '1-minute timer',
};
const COLORS = ['#ffffff', '#1b1b21', '#bac3ff', '#4a55a8', '#ffd08a', '#ff9ad5', '#3fae78', '#dc362e'];
const BGS: { label: string; bg: Background; swatch: string }[] = [
  { label: 'Aurora loop', bg: { kind: 'aurora' }, swatch: 'linear-gradient(135deg,#5b67d8,#c45bd8 60%,#3fb8c9)' },
  { label: 'Indigo', bg: { kind: 'gradient', from: '#4a55a8', to: '#1a1d45' }, swatch: 'linear-gradient(135deg,#4a55a8,#1a1d45)' },
  { label: 'Sunset', bg: { kind: 'gradient', from: '#f6c08a', to: '#c45b6a' }, swatch: 'linear-gradient(135deg,#f6c08a,#c45b6a)' },
  { label: 'Charcoal', bg: { kind: 'color', value: '#1b1b21' }, swatch: '#1b1b21' },
  { label: 'Paper', bg: { kind: 'color', value: '#f6f4ee' }, swatch: '#f6f4ee' },
  { label: 'Green screen', bg: { kind: 'color', value: '#00b140' }, swatch: '#00b140' },
];

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const same = (a: Background, b: Background) => JSON.stringify(a) === JSON.stringify(b);

export function Builder(props: {
  studio: Studio;
  initial: CustomScene;
  isNew: boolean;
  onSave: (c: CustomScene) => void;
  onCancel: () => void;
  onDelete: (id: number) => void;
}) {
  const { studio, initial, isNew, onSave, onCancel, onDelete } = props;
  const [scene, setScene] = useState<CustomScene>(initial);
  const [sel, setSel] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [guides, setGuides] = useState({ v: false, h: false });
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; mode: 'move' | 'size'; sx: number; sy: number; l: Layer; rect: DOMRect } | null>(null);

  // The real engine draws the scene being edited, live.
  useEffect(() => {
    stageRef.current?.prepend(studio.comp.canvas);
  }, [studio]);
  useEffect(() => {
    studio.comp.previewCustom(scene);
  }, [studio, scene]);

  const layer = scene.layers.find((l) => l.id === sel) ?? null;
  const setLayers = (fn: (ls: Layer[]) => Layer[]) => setScene((s) => ({ ...s, layers: fn(s.layers) }));
  const upd = (patch: Partial<Layer>) => sel && setLayers((ls) => ls.map((l) => (l.id === sel ? { ...l, ...patch } : l)));

  const add = (type: LayerType) => {
    const l = newLayer(type);
    setLayers((ls) => [...ls, l]);
    setSel(l.id);
    setMenu(false);
  };
  const remove = () => {
    setLayers((ls) => ls.filter((l) => l.id !== sel));
    setSel(null);
  };
  const duplicate = () => {
    if (!layer) return;
    const c = { ...layer, id: newLayer(layer.type).id, name: `${layer.name} copy`, x: clamp(layer.x + 0.03, 0, 0.9), y: clamp(layer.y + 0.03, 0, 0.9) };
    setLayers((ls) => {
      const i = ls.findIndex((l) => l.id === layer.id);
      const n = ls.slice();
      n.splice(i + 1, 0, c);
      return n;
    });
    setSel(c.id);
  };
  const moveTo = (to: number) =>
    setLayers((ls) => {
      const i = ls.findIndex((l) => l.id === sel);
      if (i < 0) return ls;
      const n = ls.slice();
      const [it] = n.splice(i, 1);
      n.splice(clamp(to, 0, n.length), 0, it);
      return n;
    });
  const idx = scene.layers.findIndex((l) => l.id === sel);
  const camIdx = scene.layers.findIndex((l) => l.type === 'camera');
  const canBehind = !!layer && layer.type !== 'camera' && camIdx >= 0;
  const isBehind = canBehind && idx < camIdx;

  const onMedia = async (e: React.ChangeEvent<HTMLInputElement>, target: 'layer' | 'bg') => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const key = await storeMedia(f);
    await loadMedia(key);
    if (target === 'bg') setScene((s) => ({ ...s, bg: { kind: 'video', media: key } }));
    else upd({ media: key });
  };

  // ---- drag & resize on the preview ----
  const down = (e: RPointerEvent, l: Layer, mode: 'move' | 'size') => {
    e.stopPropagation();
    e.preventDefault();
    const rect = stageRef.current!.getBoundingClientRect();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { id: l.id, mode, sx: e.clientX, sy: e.clientY, l, rect };
    setSel(l.id);
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / d.rect.width;
    const dy = (e.clientY - d.sy) / d.rect.height;
    if (d.mode === 'size') {
      const w = clamp(d.l.w + dx, 0.03, 1);
      // Keep the shape's proportions unless Shift is held.
      const h = e.shiftKey ? clamp(d.l.h + dy, 0.03, 1) : (d.l.h * w) / d.l.w;
      setLayers((ls) => ls.map((l) => (l.id === d.id ? { ...l, w, h } : l)));
      return;
    }
    let x = d.l.x + dx;
    let y = d.l.y + dy;
    let v = false;
    let h = false;
    const snap = 0.012;
    if (Math.abs(x + d.l.w / 2 - 0.5) < snap) ((x = 0.5 - d.l.w / 2), (v = true));
    else if (Math.abs(x) < snap) x = 0;
    else if (Math.abs(x + d.l.w - 1) < snap) x = 1 - d.l.w;
    if (Math.abs(y + d.l.h / 2 - 0.5) < snap * 1.8) ((y = 0.5 - d.l.h / 2), (h = true));
    else if (Math.abs(y) < snap * 1.8) y = 0;
    else if (Math.abs(y + d.l.h - 1) < snap * 1.8) y = 1 - d.l.h;
    setGuides({ v, h });
    setLayers((ls) => ls.map((l) => (l.id === d.id ? { ...l, x, y } : l)));
  };
  const up = () => {
    drag.current = null;
    setGuides({ v: false, h: false });
  };

  // Delete removes the selected layer; arrows nudge it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (!sel) return;
      const step = e.shiftKey ? 0.02 : 0.004;
      const nudge: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        setScene((s) => ({ ...s, layers: s.layers.filter((l) => l.id !== sel) }));
        setSel(null);
      } else if (nudge[e.key]) {
        e.preventDefault();
        const [dx, dy] = nudge[e.key];
        setScene((s) => ({ ...s, layers: s.layers.map((l) => (l.id === sel ? { ...l, x: l.x + dx, y: l.y + dy } : l)) }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel]);

  const swatches = (key: 'borderColor' | 'color' | 'fill', value?: string) => (
    <div className="swatch-row">
      {COLORS.map((c) => (
        <button key={c} type="button" className={`dot press ${value === c ? 'active' : ''}`} style={{ background: c }} aria-label={c} aria-pressed={value === c} onClick={() => upd({ [key]: c })} />
      ))}
      <input type="color" aria-label="Custom color" value={/^#[0-9a-f]{6}$/i.test(value ?? '') ? value : '#ffffff'} onChange={(e) => upd({ [key]: e.target.value })} />
    </div>
  );
  const sw = (on: boolean, flip: () => void, label: string, note?: string) => (
    <div className="row">
      <div className="tile-main">
        <div className="tile-title">{label}</div>
        {note && <div className="note">{note}</div>}
      </div>
      <button className="switch" type="button" role="switch" aria-checked={on} aria-label={label} onClick={flip}>
        <i />
      </button>
    </div>
  );

  return (
    <div className="builder">
      <header className="builder-head">
        <button className="text-btn press" type="button" onClick={onCancel}>
          ‹ Back without saving
        </button>
        <div className="builder-title">
          <span className="note">Scene builder</span>
          <b>{scene.name || 'Untitled scene'}</b>
        </div>
        {!isNew && (
          <button className="text-btn press danger" type="button" onClick={() => window.confirm(`Delete “${scene.name}”?`) && onDelete(scene.id)}>
            Delete scene
          </button>
        )}
        <button className="small-btn press" type="button" onClick={() => onSave({ ...scene, name: scene.name.trim() || 'Untitled scene' })}>
          Save scene
        </button>
      </header>

      <div className="builder-body">
        {/* Layers */}
        <aside className="panel scroll builder-left" aria-label="Layers">
          <div className="sub">Start from</div>
          <div className="chip-row">
            {templates().map((t) => (
              <button
                key={t.name}
                type="button"
                className="chip press"
                onClick={() => {
                  const made = t.make();
                  setScene((s) => ({ ...made, id: s.id }));
                  setSel(null);
                }}
              >
                {t.name}
              </button>
            ))}
          </div>
          <div className="divider" />
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 className="h-section">Layers</h2>
            <span className="note">Top = front</span>
          </div>
          {scene.layers.length === 0 && <div className="empty">Add a camera, a screen, text… to build your scene.</div>}
          {scene.layers
            .slice()
            .reverse()
            .map((l) => (
              <div key={l.id} className={`layer-row ${l.id === sel ? 'active' : ''}`}>
                <button type="button" className="tile-btn" onClick={() => setSel(l.id)}>
                  <span className={`layer-badge t-${l.type}`}>{ADD.find((a) => a.type === l.type)?.letter}</span>
                  <span className="tile-main">
                    <span className="tile-title">{l.name}</span>
                    <span className="tile-note">{KIND[l.type]}</span>
                  </span>
                </button>
                <button type="button" className="icon-btn press" aria-label={l.hidden ? `Show ${l.name}` : `Hide ${l.name}`} style={{ opacity: l.hidden ? 0.4 : 1 }} onClick={() => setLayers((ls) => ls.map((x) => (x.id === l.id ? { ...x, hidden: !x.hidden } : x)))}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
            ))}
          <button className="upload-btn press tonal" type="button" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            + Add layer
          </button>
          {menu && (
            <div className="add-grid">
              {ADD.map((a) => (
                <button key={a.type} type="button" className="add-tile press" onClick={() => add(a.type)}>
                  <span className={`layer-badge t-${a.type}`}>{a.letter}</span>
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* Preview */}
        <section className="builder-center" aria-label="Preview">
          <div className="stage" ref={stageRef} onPointerMove={move} onPointerUp={up}>
            <div className="edit-overlay" onPointerDown={() => setSel(null)}>
              {scene.layers.map((l) =>
                l.hidden ? null : (
                  <div
                    key={l.id}
                    className={`hit ${l.id === sel ? 'active' : ''}`}
                    style={{ left: `${l.x * 100}%`, top: `${l.y * 100}%`, width: `${l.w * 100}%`, height: `${l.h * 100}%` }}
                    onPointerDown={(e) => down(e, l, 'move')}
                    title={l.name}
                  >
                    {l.id === sel && <span className="handle" onPointerDown={(e) => down(e, l, 'size')} />}
                  </div>
                ),
              )}
              {guides.v && <i className="guide v" />}
              {guides.h && <i className="guide h" />}
            </div>
          </div>
          <div className="note">Drag to move · drag the corner to resize (hold Shift to stretch) · arrow keys nudge · Delete removes</div>
        </section>

        {/* Properties */}
        <aside className="panel scroll builder-right" aria-label="Properties">
          {!layer && (
            <div className="section">
              <h2 className="h-section">Scene</h2>
              <label className="field">
                Name
                <input value={scene.name} placeholder="Name your scene" onChange={(e) => setScene({ ...scene, name: e.target.value })} />
              </label>
              <div className="sub">Background</div>
              <div className="bg-grid">
                {BGS.map((b) => (
                  <button key={b.label} type="button" className={`bg-opt press ${same(scene.bg, b.bg) ? 'active' : ''}`} onClick={() => setScene({ ...scene, bg: b.bg })}>
                    <i style={{ background: b.swatch }} />
                    {b.label}
                  </button>
                ))}
              </div>
              <label className="upload-btn press tonal">
                Upload a looping video
                <input type="file" accept="video/*" onChange={(e) => onMedia(e, 'bg')} />
              </label>
              {scene.bg.kind === 'video' && <div className="note">Your video plays silently on a loop behind everything.</div>}
              <div className="tip">
                <b>Put things behind you:</b> select your camera and turn on “Remove background”. Then select a layer and choose “Behind me”.
              </div>
            </div>
          )}

          {layer && (
            <div className="section">
              <div className="row">
                <input className="name-input" aria-label="Layer name" value={layer.name} onChange={(e) => upd({ name: e.target.value })} />
                <button className="icon-btn press" type="button" aria-label="Duplicate layer" title="Duplicate" onClick={duplicate}>
                  ⧉
                </button>
                <button className="icon-btn press" type="button" aria-label="Delete layer" title="Delete" onClick={remove}>
                  <IconClose />
                </button>
              </div>
              <div className="chip-row">
                <button className="chip press" type="button" onClick={() => moveTo(idx + 1)}>
                  Bring forward
                </button>
                <button className="chip press" type="button" onClick={() => moveTo(idx - 1)}>
                  Send back
                </button>
                {canBehind && (
                  <>
                    <button className={`chip press ${isBehind ? 'active' : ''}`} type="button" onClick={() => moveTo(idx < camIdx ? camIdx - 1 : camIdx)}>
                      Behind me
                    </button>
                    <button className={`chip press ${!isBehind ? 'active' : ''}`} type="button" onClick={() => moveTo(idx < camIdx ? camIdx : camIdx + 1)}>
                      In front of me
                    </button>
                  </>
                )}
              </div>

              {layer.type === 'camera' &&
                sw(!!layer.cutout, () => upd({ cutout: !layer.cutout }), 'Remove background', 'You float over the scene; layers can go behind you.')}

              {layer.type === 'text' && (
                <>
                  <label className="field">
                    Text
                    <input autoFocus value={layer.text ?? ''} placeholder="Type your text" onChange={(e) => upd({ text: e.target.value })} />
                  </label>
                  <div className="chip-row">
                    {['title', 'name', 'role', 'date'].map((k) => (
                      <button key={k} type="button" className="chip press" onClick={() => upd({ text: `${layer.text ?? ''} {${k}}`.trim() })}>
                        + {k === 'role' ? 'subtitle' : k}
                      </button>
                    ))}
                  </div>
                  <label className="field">
                    Size
                    <input type="range" min={16} max={260} value={layer.fontSize ?? 64} onChange={(e) => upd({ fontSize: +e.target.value })} />
                  </label>
                  <div className="seg">
                    {[
                      [500, 'Regular'],
                      [750, 'Bold'],
                      [900, 'Black'],
                    ].map(([w, label]) => (
                      <button key={w} type="button" className={`seg-btn press ${layer.weight === w ? 'active' : ''}`} onClick={() => upd({ weight: w as number })}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="seg">
                    {(['left', 'center', 'right'] as const).map((a) => (
                      <button key={a} type="button" className={`seg-btn press ${(layer.align ?? 'left') === a ? 'active' : ''}`} onClick={() => upd({ align: a })}>
                        {a[0].toUpperCase() + a.slice(1)}
                      </button>
                    ))}
                  </div>
                  <div className="sub">Color</div>
                  {swatches('color', layer.color)}
                  {sw(!!layer.pill, () => upd({ pill: !layer.pill }), 'Background pill')}
                </>
              )}

              {layer.type !== 'text' && !(layer.type === 'camera' && layer.cutout) && (
                <>
                  <div className="sub">Shape</div>
                  <div className="shape-grid">
                    {SHAPES.map((s) => (
                      <button key={s.id} type="button" className={`shape-opt press ${layer.shape === s.id ? 'active' : ''}`} aria-pressed={layer.shape === s.id} onClick={() => upd({ shape: s.id })}>
                        <i style={{ clipPath: cssClip(s.id) }} />
                        {s.label}
                      </button>
                    ))}
                  </div>
                  {layer.shape === 'rounded' && (
                    <label className="field">
                      Roundness
                      <input type="range" min={0} max={1} step={0.02} value={layer.round} onChange={(e) => upd({ round: +e.target.value })} />
                    </label>
                  )}
                  <label className="field">
                    Border
                    <input type="range" min={0} max={24} value={layer.border} onChange={(e) => upd({ border: +e.target.value })} />
                  </label>
                  {layer.border > 0 && swatches('borderColor', layer.borderColor)}
                </>
              )}

              {(layer.type === 'shape' || layer.type === 'timer') && (
                <>
                  <div className="sub">Fill</div>
                  {swatches('fill', layer.fill)}
                </>
              )}
              {(layer.type === 'image' || layer.type === 'clip') && (
                <label className="upload-btn press tonal">
                  {layer.type === 'image' ? 'Choose a picture' : 'Choose a video (loops silently)'}
                  <input type="file" accept={layer.type === 'image' ? 'image/*' : 'video/*'} onChange={(e) => onMedia(e, 'layer')} />
                </label>
              )}

              {sw(layer.shadow, () => upd({ shadow: !layer.shadow }), 'Shadow')}
              <label className="field">
                Opacity
                <input type="range" min={0.1} max={1} step={0.01} value={layer.opacity} onChange={(e) => upd({ opacity: +e.target.value })} />
              </label>
              <label className="field">
                Width
                <input
                  type="range"
                  min={0.03}
                  max={1}
                  step={0.005}
                  value={layer.w}
                  onChange={(e) => {
                    const w = +e.target.value;
                    upd({ w, h: (layer.h * w) / layer.w });
                  }}
                />
              </label>
              {['camera', 'screen', 'screen2', 'tool'].includes(layer.type) && scene.layers.filter((l) => l.type === layer.type).length > 1 && (
                <div className="note">Only the first {KIND[layer.type].toLowerCase()} layer shows live video.</div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
