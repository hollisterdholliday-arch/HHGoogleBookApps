// One object that owns every live device and the recording. The UI calls
// into it and re-renders when `onChange` fires.

import { AudioMixer } from './audio';
import { Compositor } from './compositor';
import { pickMimeType, Recording, type SavedFile, type Sink } from './recorder';
import { LiveCaptions, toSrt, toVtt } from './captions';

export interface DeviceLists {
  cameras: MediaDeviceInfo[];
  mics: MediaDeviceInfo[];
}

export class Studio {
  readonly comp = new Compositor();
  readonly audio = new AudioMixer();
  readonly format = pickMimeType();
  recording: Recording | null = null;
  /** Scene switches during the current recording, for chapters. */
  chapters: { t: number; scene: string }[] = [];
  cameraId = '';
  micId = '';
  screenLabel = '';
  onChange: () => void = () => {};

  constructor() {
    this.comp.screen.onEnded = () => {
      this.audio.setSystem(null);
      this.screenLabel = '';
      this.onChange();
    };
    this.comp.camera.onEnded = () => this.onChange();
    this.comp.start();
  }

  get sharing(): boolean {
    return this.comp.screen.active;
  }
  get cameraLive(): boolean {
    return this.comp.camera.active;
  }
  get micLive(): boolean {
    return !!this.audio.micStream?.getAudioTracks().some((t) => t.readyState === 'live');
  }

  async shareScreen(): Promise<void> {
    this.audio.resume();
    const opts = {
      video: { frameRate: { ideal: 30 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      systemAudio: 'include',
      selfBrowserSurface: 'exclude', // never offer the recorder's own tab (hall of mirrors)
      surfaceSwitching: 'include',
      monitorTypeSurfaces: 'include',
    } as DisplayMediaStreamOptions;
    const stream = await navigator.mediaDevices.getDisplayMedia(opts);
    this.comp.screen.start(stream);
    this.audio.setSystem(stream);
    this.screenLabel = stream.getVideoTracks()[0]?.label || 'Shared screen';
    this.onChange();
  }

  /** A second shared window, for the Two screens scene. */
  async shareSecond(): Promise<void> {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30 } },
      audio: true,
      selfBrowserSurface: 'exclude',
    } as DisplayMediaStreamOptions);
    this.comp.screen2.start(stream);
    this.audio.setExtra('screen2', stream);
    this.comp.screen2.onEnded = () => {
      this.audio.setExtra('screen2', null);
      this.onChange();
    };
    this.onChange();
  }

  stopSecond(): void {
    this.comp.screen2.stop();
    this.audio.setExtra('screen2', null);
    this.onChange();
  }

  /**
   * Record one element of this page (the teaching tool) with Chrome's
   * Element Capture, falling back to Region Capture on older Chrome.
   */
  async captureElement(el: HTMLElement): Promise<void> {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30 } },
      audio: true,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      surfaceSwitching: 'exclude',
    } as DisplayMediaStreamOptions);
    const track = stream.getVideoTracks()[0] as MediaStreamTrack & {
      restrictTo?: (t: unknown) => Promise<void>;
      cropTo?: (t: unknown) => Promise<void>;
    };
    const w = window as unknown as {
      RestrictionTarget?: { fromElement(e: Element): Promise<unknown> };
      CropTarget?: { fromElement(e: Element): Promise<unknown> };
    };
    if (w.RestrictionTarget && track.restrictTo) await track.restrictTo(await w.RestrictionTarget.fromElement(el));
    else if (w.CropTarget && track.cropTo) await track.cropTo(await w.CropTarget.fromElement(el));
    else {
      // Something other than this tab was picked: don't record the wrong thing.
      stream.getTracks().forEach((t) => t.stop());
      throw new Error('not-this-tab');
    }
    this.comp.tool.start(stream);
    this.audio.setExtra('tool', stream);
    this.comp.tool.onEnded = () => {
      this.audio.setExtra('tool', null);
      this.onChange();
    };
    this.onChange();
  }

  stopToolCapture(): void {
    this.comp.tool.stop();
    this.audio.setExtra('tool', null);
    this.onChange();
  }

  stopShare(): void {
    this.comp.screen.stop();
    this.audio.setSystem(null);
    this.screenLabel = '';
    this.onChange();
  }

  async startCamera(deviceId = this.cameraId): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      },
    });
    this.cameraId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? deviceId;
    this.comp.camera.start(stream);
    this.onChange();
  }

  stopCamera(): void {
    this.comp.camera.stop();
    this.onChange();
  }

  async startMic(deviceId = this.micId): Promise<void> {
    this.audio.resume();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.micId = stream.getAudioTracks()[0]?.getSettings().deviceId ?? deviceId;
    this.audio.setMic(stream);
    this.onChange();
  }

  stopMic(): void {
    this.audio.setMic(null);
    this.onChange();
  }

  async devices(): Promise<DeviceLists> {
    const all = await navigator.mediaDevices.enumerateDevices();
    return {
      cameras: all.filter((d) => d.kind === 'videoinput' && d.deviceId),
      mics: all.filter((d) => d.kind === 'audioinput' && d.deviceId),
    };
  }

  markScene(name: string): void {
    if (!this.recording) return;
    const t = Math.round(this.recording.elapsed() * 10) / 10;
    const last = this.chapters.at(-1);
    if (last && t - last.t < 1) last.scene = name; // quick flicks count once
    else this.chapters.push({ t, scene: name });
  }

  /** Live on-device captions while recording (set from settings). */
  captionsOn = false;
  captionLang = 'en-US';
  private captions: LiveCaptions | null = null;

  startRecording(sink: Sink, firstScene: string): void {
    const video = this.comp.captureStream().getVideoTracks()[0];
    const stream = new MediaStream([video, this.audio.track]);
    const rec = new Recording(stream, this.format.mime, sink);
    this.recording = rec;
    this.chapters = [{ t: 0, scene: firstScene }];
    rec.start();
    if (this.captionsOn) {
      this.captions = new LiveCaptions(() => rec.elapsed(), () => rec.paused, this.captionLang);
      this.captions.start();
    }
    this.onChange();
  }

  async stopRecording(): Promise<SavedFile | null> {
    const r = this.recording;
    if (!r) return null;
    this.recording = null;
    const duration = r.elapsed();
    const cues = this.captions?.stop() ?? [];
    this.captions = null;
    this.onChange();
    const saved = await r.stop();
    // Companion files: chapters for the Library, captions for Classroom/YouTube.
    await saved
      .saveSidecar('json', JSON.stringify({ version: 1, duration, chapters: this.chapters, captions: cues.length > 0 }, null, 2))
      .catch(() => {});
    if (cues.length) {
      await saved.saveSidecar('vtt', toVtt(cues)).catch(() => {});
      await saved.saveSidecar('srt', toSrt(cues)).catch(() => {});
    }
    return saved;
  }
}
