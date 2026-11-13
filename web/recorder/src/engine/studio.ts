// One object that owns every live device and the recording. The UI calls
// into it and re-renders when `onChange` fires.

import { AudioMixer } from './audio';
import { Compositor } from './compositor';
import { pickMimeType, Recording, type SavedFile, type Sink } from './recorder';

export interface DeviceLists {
  cameras: MediaDeviceInfo[];
  mics: MediaDeviceInfo[];
}

export class Studio {
  readonly comp = new Compositor();
  readonly audio = new AudioMixer();
  readonly format = pickMimeType();
  recording: Recording | null = null;
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

  startRecording(sink: Sink): void {
    const video = this.comp.captureStream().getVideoTracks()[0];
    const stream = new MediaStream([video, this.audio.track]);
    this.recording = new Recording(stream, this.format.mime, sink);
    this.recording.start();
    this.onChange();
  }

  async stopRecording(): Promise<SavedFile | null> {
    const r = this.recording;
    if (!r) return null;
    this.recording = null;
    this.onChange();
    return r.stop();
  }
}
