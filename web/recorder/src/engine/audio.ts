// Mixes the microphone and the shared screen's sound into one track for the
// recording, and measures the mic level for the meter.

export class AudioMixer {
  readonly ctx = new AudioContext({ latencyHint: 'interactive' });
  readonly dest = this.ctx.createMediaStreamDestination();
  private analyser = this.ctx.createAnalyser();
  private micNode: MediaStreamAudioSourceNode | null = null;
  private micGain = this.ctx.createGain();
  private sysNode: MediaStreamAudioSourceNode | null = null;
  private sysGain = this.ctx.createGain();
  private buf = new Float32Array(1024);
  micStream: MediaStream | null = null;

  constructor() {
    this.analyser.fftSize = 1024;
    this.micGain.connect(this.dest);
    this.micGain.connect(this.analyser);
    this.sysGain.connect(this.dest);
  }

  get track(): MediaStreamTrack {
    return this.dest.stream.getAudioTracks()[0];
  }

  resume(): void {
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  setMic(stream: MediaStream | null): void {
    this.micNode?.disconnect();
    this.micNode = null;
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = stream;
    if (stream && stream.getAudioTracks().length) {
      this.micNode = this.ctx.createMediaStreamSource(stream);
      this.micNode.connect(this.micGain);
    }
  }

  setMicMuted(muted: boolean): void {
    this.micGain.gain.value = muted ? 0 : 1;
  }

  /** Sound captured with a screen or tab share (may be absent). */
  setSystem(stream: MediaStream | null): void {
    this.sysNode?.disconnect();
    this.sysNode = null;
    if (stream && stream.getAudioTracks().length) {
      this.sysNode = this.ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
      this.sysNode.connect(this.sysGain);
    }
  }

  get hasSystemAudio(): boolean {
    return !!this.sysNode;
  }

  /** Mic loudness, 0..1. */
  level(): number {
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);
    return Math.min(1, rms * 6 * this.micGain.gain.value);
  }
}
