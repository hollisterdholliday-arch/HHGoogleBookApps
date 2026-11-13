// Lossless trim: copies the compressed video/audio between two times into a
// new MP4 without re-encoding, so it is fast and keeps full quality.
// Demux with mp4box.js (BSD-3-Clause), mux with mp4-muxer (MIT).
// The start snaps back to the nearest keyframe (at most ~2 s earlier).

import { createFile, DataStream, Endianness, MP4BoxBuffer, type Sample } from 'mp4box';
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';

interface TrackInfo {
  id: number;
  codec: string;
  timescale: number;
  video?: { width: number; height: number };
  audio?: { sample_rate: number; channel_count: number };
}

function videoDescription(trak: unknown): Uint8Array | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entry = (trak as any).mdia.minf.stbl.stsd.entries[0];
  const box = entry.avcC ?? entry.hvcC ?? entry.av1C; // VP9 needs no description
  if (!box) return undefined;
  const ds = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
  box.write(ds);
  return new Uint8Array(ds.buffer, 8); // skip the box header
}

function audioDescription(trak: unknown): Uint8Array | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const esds = (trak as any).mdia.minf.stbl.stsd.entries[0]?.esds;
  const data = esds?.esd?.descs?.[0]?.descs?.[0]?.data;
  return data ? new Uint8Array(data) : undefined;
}

// Chrome records H.264/AAC on most computers, VP9/Opus where H.264 isn't available.
const videoKind = (c: string): 'avc' | 'hevc' | 'vp9' | 'av1' =>
  /^(hvc|hev)/.test(c) ? 'hevc' : c.startsWith('vp09') ? 'vp9' : c.startsWith('av01') ? 'av1' : 'avc';
const audioKind = (c: string): 'aac' | 'opus' => (/opus/i.test(c) ? 'opus' : 'aac');

export async function trimMp4(file: Blob, startSec: number, endSec: number): Promise<Blob> {
  const buf = await file.arrayBuffer();
  const mp4 = createFile(true); // keep the sample bytes, not just the index
  const samples = new Map<number, Sample[]>();
  mp4.onSamples = (id, _u, s) => {
    const list = samples.get(id) ?? [];
    list.push(...s);
    samples.set(id, list);
  };
  let info: { tracks: TrackInfo[] } | null = null;
  let failure: unknown = null;
  // Extraction has to be set up as soon as the header is parsed, before the
  // rest of the (fragmented) file is fed in.
  mp4.onReady = (i) => {
    info = i as unknown as { tracks: TrackInfo[] };
    for (const t of info.tracks) if ((t as TrackInfo).video || (t as TrackInfo).audio) mp4.setExtractionOptions(t.id, null, { nbSamples: Infinity });
    mp4.start();
  };
  mp4.onError = (e) => (failure = e);
  mp4.appendBuffer(MP4BoxBuffer.fromArrayBuffer(buf, 0));
  mp4.flush();
  if (failure || !info) throw new Error(`Could not read video: ${String(failure ?? 'no header')}`);
  const tracks = (info as { tracks: TrackInfo[] }).tracks;
  const vt = tracks.find((t) => t.video);
  const at = tracks.find((t) => t.audio);
  if (!vt) throw new Error('No video track');

  const vs = samples.get(vt.id) ?? [];
  if (!vs.length) throw new Error('No video samples');
  const sec = (s: Sample, ts: number) => s.cts / ts;
  // Start at the last keyframe at or before the requested start.
  let first = 0;
  for (let i = 0; i < vs.length; i++) {
    if (sec(vs[i], vt.timescale) > startSec) break;
    if (vs[i].is_sync) first = i;
  }
  const t0 = sec(vs[first], vt.timescale);
  const keepV = vs.slice(first).filter((s) => sec(s, vt.timescale) <= endSec);

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: videoKind(vt.codec), width: vt.video!.width, height: vt.video!.height },
    audio: at ? { codec: audioKind(at.codec), sampleRate: at.audio!.sample_rate, numberOfChannels: at.audio!.channel_count } : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  const vdesc = videoDescription(mp4.getTrackById(vt.id));
  keepV.forEach((s, i) => {
    muxer.addVideoChunkRaw(
      new Uint8Array(s.data as Uint8Array),
      s.is_sync ? 'key' : 'delta',
      Math.round(((s.cts / vt.timescale) - t0) * 1e6),
      Math.round((s.duration / vt.timescale) * 1e6),
      i === 0
        ? {
            decoderConfig: {
              codec: vt.codec,
              codedWidth: vt.video!.width,
              codedHeight: vt.video!.height,
              description: vdesc,
              // Standard HD color (what Chrome records); VP9 requires it spelled out.
              colorSpace: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false },
            },
          }
        : undefined,
    );
  });
  if (at) {
    const adesc = audioDescription(mp4.getTrackById(at.id));
    const as = (samples.get(at.id) ?? []).filter((s) => {
      const t = sec(s, at.timescale);
      return t >= t0 && t <= endSec;
    });
    as.forEach((s, i) => {
      muxer.addAudioChunkRaw(
        new Uint8Array(s.data as Uint8Array),
        'key',
        Math.round(((s.cts / at.timescale) - t0) * 1e6),
        Math.round((s.duration / at.timescale) * 1e6),
        i === 0 ? { decoderConfig: { codec: at.codec, sampleRate: at.audio!.sample_rate, numberOfChannels: at.audio!.channel_count, description: adesc } } : undefined,
      );
    });
  }
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}
