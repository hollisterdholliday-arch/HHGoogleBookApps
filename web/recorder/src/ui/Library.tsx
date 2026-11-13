// Library: every recording in your save folder, with a player, chapters
// (from scene switches), captions, lossless trim, rename and delete.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseVtt, toSrt, type Cue } from '../engine/captions';
import { baseName, writeBlob, writeText } from '../lib/folder';
import { IconClose, IconPlay } from './icons';

interface Item {
  name: string;
  handle: FileSystemFileHandle;
  size: number;
  modified: number;
  meta: { duration?: number; chapters?: { t: number; scene: string }[] } | null;
  vtt: string | null;
}

const VIDEO = /\.(mp4|webm)$/i;
const fmt = (s: number) => {
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};
const when = (ms: number) => {
  const d = new Date(ms);
  const today = new Date();
  const y = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return `Today ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};
const mb = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(0.1, n / 1e6).toFixed(1)} MB`);

async function readText(dir: FileSystemDirectoryHandle, name: string): Promise<string | null> {
  try {
    return await (await (await dir.getFileHandle(name)).getFile()).text();
  } catch {
    return null;
  }
}

export function Library(props: {
  folder: FileSystemDirectoryHandle | null;
  onChooseFolder: () => void;
  say: (msg: string) => void;
}) {
  const { folder, onChooseFolder, say } = props;
  const [access, setAccess] = useState<'unknown' | 'granted' | 'prompt'>('unknown');
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'new' | 'old' | 'az'>('new');
  const [sel, setSel] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [url, setUrl] = useState<string | null>(null);
  const [vttUrl, setVttUrl] = useState<string | null>(null);
  const [dur, setDur] = useState(0);
  const [now, setNow] = useState(0);
  const [trim, setTrim] = useState<[number, number]>([0, 0]);
  const [busy, setBusy] = useState('');
  const [rename, setRename] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);

  const checkAccess = useCallback(async () => {
    if (!folder) return;
    const p = await folder.queryPermission({ mode: 'readwrite' });
    setAccess(p === 'granted' ? 'granted' : 'prompt');
  }, [folder]);
  useEffect(() => void checkAccess(), [checkAccess]);

  const load = useCallback(async () => {
    if (!folder || access !== 'granted') return;
    setLoading(true);
    const list: Item[] = [];
    for await (const [name, h] of folder.entries()) {
      if (h.kind !== 'file' || !VIDEO.test(name)) continue;
      const f = await (h as FileSystemFileHandle).getFile();
      const metaText = await readText(folder, `${baseName(name)}.json`);
      let meta = null;
      try {
        meta = metaText ? JSON.parse(metaText) : null;
      } catch {
        /* ignore a broken sidecar */
      }
      list.push({ name, handle: h as FileSystemFileHandle, size: f.size, modified: f.lastModified, meta, vtt: await readText(folder, `${baseName(name)}.vtt`) });
    }
    setItems(list);
    setLoading(false);
  }, [folder, access]);
  useEffect(() => void load(), [load]);

  // Thumbnails, one at a time, from about a second in.
  useEffect(() => {
    let stop = false;
    (async () => {
      for (const it of items) {
        if (stop) return;
        if (thumbs[it.name]) continue;
        try {
          const src = URL.createObjectURL(await it.handle.getFile());
          const v = document.createElement('video');
          v.muted = true;
          v.src = src;
          await new Promise((r, j) => ((v.onloadeddata = r), (v.onerror = j)));
          v.currentTime = Math.min(1, (v.duration || 2) / 2);
          await new Promise((r) => (v.onseeked = r));
          const c = document.createElement('canvas');
          c.width = 384;
          c.height = 216;
          c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
          const data = c.toDataURL('image/jpeg', 0.75);
          URL.revokeObjectURL(src);
          if (!stop) setThumbs((t) => ({ ...t, [it.name]: data }));
        } catch {
          /* no thumbnail */
        }
      }
    })();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const l = items.filter((i) => !q || i.name.toLowerCase().includes(q));
    if (sort === 'new') l.sort((a, b) => b.modified - a.modified);
    if (sort === 'old') l.sort((a, b) => a.modified - b.modified);
    if (sort === 'az') l.sort((a, b) => a.name.localeCompare(b.name));
    return l;
  }, [items, query, sort]);

  const cur = items.find((i) => i.name === sel) ?? null;

  // Load the selected video into the player.
  useEffect(() => {
    let u: string | null = null;
    let v: string | null = null;
    (async () => {
      if (!cur) return setUrl(null);
      u = URL.createObjectURL(await cur.handle.getFile());
      v = cur.vtt ? URL.createObjectURL(new Blob([cur.vtt], { type: 'text/vtt' })) : null;
      setUrl(u);
      setVttUrl(v);
      setRename(baseName(cur.name));
    })();
    return () => {
      if (u) URL.revokeObjectURL(u);
      if (v) URL.revokeObjectURL(v);
    };
  }, [cur]);

  const onMeta = () => {
    const v = videoRef.current;
    if (!v) return;
    const d = isFinite(v.duration) ? v.duration : cur?.meta?.duration ?? 0;
    setDur(d);
    setTrim([0, d]);
  };

  const chapters = cur?.meta?.chapters ?? [];
  const cues: Cue[] = useMemo(() => (cur?.vtt ? parseVtt(cur.vtt) : []), [cur]);
  const seek = (t: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = t;
  };

  const saveTrim = async () => {
    if (!cur || !folder) return;
    if (!/\.mp4$/i.test(cur.name)) return say('Trimming works on MP4 recordings.');
    setBusy('Saving trimmed copy…');
    try {
      const { trimMp4 } = await import('../engine/trim');
      const out = await trimMp4(await cur.handle.getFile(), trim[0], trim[1]);
      const name = await writeBlob(folder, `${baseName(cur.name)} (trimmed).mp4`, out);
      if (chapters.length) {
        const ch = chapters.filter((c) => c.t < trim[1]).map((c) => ({ ...c, t: Math.max(0, c.t - trim[0]) }));
        await writeText(folder, `${baseName(name)}.json`, JSON.stringify({ version: 1, duration: trim[1] - trim[0], chapters: ch }, null, 2));
      }
      say(`Saved “${name}”.`);
      await load();
      setSel(name);
    } catch (e) {
      console.warn(e);
      say('Could not trim this video.');
    }
    setBusy('');
  };

  const doRename = async () => {
    if (!cur || !folder) return;
    const next = rename.trim().replace(/[\\/:*?"<>|]+/g, '-');
    if (!next || next === baseName(cur.name)) return;
    const ext = cur.name.slice(cur.name.lastIndexOf('.'));
    try {
      const h = cur.handle as FileSystemFileHandle & { move?: (n: string) => Promise<void> };
      if (h.move) await h.move(`${next}${ext}`);
      else {
        await writeBlob(folder, `${next}${ext}`, await cur.handle.getFile());
        await folder.removeEntry(cur.name);
      }
      for (const side of ['json', 'vtt', 'srt']) {
        const t = await readText(folder, `${baseName(cur.name)}.${side}`);
        if (t !== null) {
          await writeText(folder, `${next}.${side}`, t);
          await folder.removeEntry(`${baseName(cur.name)}.${side}`).catch(() => {});
        }
      }
      await load();
      setSel(`${next}${ext}`);
    } catch {
      say('Could not rename. A file with that name may already exist.');
    }
  };

  const del = async () => {
    if (!cur || !folder) return;
    if (!window.confirm(`Delete “${cur.name}”? This removes it from your computer.`)) return;
    await folder.removeEntry(cur.name).catch(() => {});
    for (const side of ['json', 'vtt', 'srt']) await folder.removeEntry(`${baseName(cur.name)}.${side}`).catch(() => {});
    setSel(null);
    await load();
  };

  const download = (name: string, text: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = name;
    a.click();
  };

  if (!folder)
    return (
      <div className="lib-empty">
        <h2 className="h-section">No save folder yet</h2>
        <p className="note">Choose the folder your recordings go to, and they’ll show up here.</p>
        <button className="small-btn press" type="button" onClick={onChooseFolder}>
          Choose folder
        </button>
      </div>
    );
  if (access !== 'granted')
    return (
      <div className="lib-empty">
        <h2 className="h-section">Allow access to “{folder.name}”</h2>
        <p className="note">Chrome needs your OK each visit to list the videos in this folder.</p>
        <button
          className="small-btn press"
          type="button"
          onClick={async () => setAccess((await folder.requestPermission({ mode: 'readwrite' })) === 'granted' ? 'granted' : 'prompt')}
        >
          Allow
        </button>
      </div>
    );

  return (
    <div className="lib">
      <section className="lib-list scroll" aria-label="Recordings">
        <div className="lib-head">
          <input className="lib-search" type="search" aria-label="Search recordings" placeholder="Search recordings" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="seg">
            {(['new', 'old', 'az'] as const).map((k) => (
              <button key={k} type="button" className={`seg-btn press ${sort === k ? 'active' : ''}`} aria-pressed={sort === k} onClick={() => setSort(k)}>
                {{ new: 'Newest', old: 'Oldest', az: 'A–Z' }[k]}
              </button>
            ))}
          </div>
        </div>
        <div className="note lib-count">
          {loading ? 'Loading…' : `${items.length} recording${items.length === 1 ? '' : 's'}`} · {folder.name}
        </div>
        <div className="lib-grid">
          {shown.map((it) => (
            <button key={it.name} type="button" className={`rec-card press ${it.name === sel ? 'active' : ''}`} aria-pressed={it.name === sel} onClick={() => setSel(it.name)}>
              <div className="rec-thumb">
                {thumbs[it.name] ? <img src={thumbs[it.name]} alt="" /> : <span className="note">Loading…</span>}
                {it.meta?.duration ? <span className="rec-dur">{fmt(it.meta.duration)}</span> : null}
                {it.vtt && <span className="rec-cc">CC</span>}
              </div>
              <div className="rec-title">{baseName(it.name)}</div>
              <div className="note">
                {when(it.modified)} · {mb(it.size)}
                {it.meta?.chapters?.length ? ` · ${it.meta.chapters.length} chapters` : ''}
              </div>
            </button>
          ))}
        </div>
        {!loading && items.length === 0 && <div className="empty">No recordings in this folder yet. Record something and it will appear here.</div>}
      </section>

      <aside className="lib-detail panel scroll" aria-label="Recording details">
        {!cur && <div className="empty">Pick a recording to play, trim or rename it.</div>}
        {cur && url && (
          <>
            <video ref={videoRef} className="lib-video" src={url} controls onLoadedMetadata={onMeta} onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}>
              {vttUrl && <track kind="captions" src={vttUrl} srcLang="en" label="Captions" default />}
            </video>

            {chapters.length > 0 && dur > 0 && (
              <div className="chapters" aria-label="Chapters">
                {chapters.map((c, i) => {
                  const end = chapters[i + 1]?.t ?? dur;
                  return (
                    <button key={i} type="button" className="chapter" style={{ flexGrow: Math.max(0.5, end - c.t) }} onClick={() => seek(c.t)} title={`${c.scene} · ${fmt(c.t)}`}>
                      <span>{c.scene}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="section">
              <div className="row trim-head">
                <span className="sub">Trim</span>
                <span className="note">
                  Keeps {fmt(trim[0])} – {fmt(trim[1])} ({fmt(trim[1] - trim[0])})
                </span>
              </div>
              <div className="trim-bar" aria-hidden="true">
                <div style={{ left: 0, width: `${(trim[0] / (dur || 1)) * 100}%` }} />
                <div style={{ right: 0, width: `${(1 - trim[1] / (dur || 1)) * 100}%` }} />
                <i style={{ left: `${(now / (dur || 1)) * 100}%` }} />
              </div>
              <label className="field">
                Start
                <input type="range" min={0} max={dur} step={0.1} value={trim[0]} onChange={(e) => setTrim([Math.min(+e.target.value, trim[1] - 1), trim[1]])} onInput={(e) => seek(+e.currentTarget.value)} />
              </label>
              <label className="field">
                End
                <input type="range" min={0} max={dur} step={0.1} value={trim[1]} onChange={(e) => setTrim([trim[0], Math.max(+e.target.value, trim[0] + 1)])} onInput={(e) => seek(+e.currentTarget.value)} />
              </label>
              <div className="row">
                <button className="small-btn press" type="button" disabled={!!busy || dur === 0} onClick={saveTrim}>
                  Save trimmed copy
                </button>
                <button className="text-btn press" type="button" onClick={() => seek(trim[0])}>
                  <IconPlay /> From start point
                </button>
              </div>
              {busy && <div className="note">{busy}</div>}
              <div className="note">Your original is kept. The cut starts at the nearest keyframe, at most a second or two early.</div>
            </div>

            <div className="divider" />
            <label className="field">
              Name
              <div className="row">
                <input value={rename} onChange={(e) => setRename(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doRename()} />
                <button className="small-btn press" type="button" onClick={doRename}>
                  Rename
                </button>
              </div>
            </label>

            <div className="section">
              <div className="sub">Captions</div>
              {cues.length > 0 ? (
                <>
                  <div className="cues scroll">
                    {cues.map((c, i) => (
                      <button key={i} type="button" className="cue" onClick={() => seek(c.start)}>
                        <b>{fmt(c.start)}</b>
                        {c.text}
                      </button>
                    ))}
                  </div>
                  <div className="row">
                    <button className="text-btn press" type="button" onClick={() => download(`${baseName(cur.name)}.srt`, toSrt(cues))}>
                      Download .srt
                    </button>
                    <button className="text-btn press" type="button" onClick={() => download(`${baseName(cur.name)}.vtt`, cur.vtt ?? '')}>
                      Download .vtt
                    </button>
                  </div>
                </>
              ) : (
                <div className="note">No captions for this video. Turn on “Live captions” in the recorder before you record.</div>
              )}
            </div>

            <div className="divider" />
            <button className="text-btn press danger" type="button" onClick={del}>
              <IconClose /> Delete recording
            </button>
          </>
        )}
      </aside>
    </div>
  );
}
