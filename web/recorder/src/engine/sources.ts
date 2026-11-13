// Live video sources (screen share, camera).
//
// Frames are read straight from the MediaStreamTrack with
// MediaStreamTrackProcessor when Chrome offers it. Unlike a <video> element,
// this keeps delivering frames while the recorder window is hidden or
// minimized, which is exactly when you are teaching in another app.

interface TrackProcessor {
  readable: ReadableStream<VideoFrame>;
}
declare const MediaStreamTrackProcessor: { new (init: { track: MediaStreamTrack }): TrackProcessor } | undefined;

export type Drawable = VideoFrame | HTMLVideoElement;

export class VideoSource {
  stream: MediaStream | null = null;
  private frame: VideoFrame | null = null;
  private video: HTMLVideoElement | null = null;
  private reader: ReadableStreamDefaultReader<VideoFrame> | null = null;
  private generation = 0;
  onEnded: (() => void) | null = null;

  get active(): boolean {
    return !!this.stream && this.stream.getVideoTracks().some((t) => t.readyState === 'live');
  }

  start(stream: MediaStream): void {
    this.stop();
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    this.stream = stream;
    const gen = ++this.generation;
    track.addEventListener('ended', () => {
      if (gen === this.generation) {
        this.stop();
        this.onEnded?.();
      }
    });

    if (typeof MediaStreamTrackProcessor !== 'undefined') {
      const proc = new MediaStreamTrackProcessor({ track });
      const reader = proc.readable.getReader();
      this.reader = reader;
      (async () => {
        for (;;) {
          let res: ReadableStreamReadResult<VideoFrame>;
          try {
            res = await reader.read();
          } catch {
            break;
          }
          if (res.done || gen !== this.generation) {
            res.value?.close();
            break;
          }
          this.frame?.close();
          this.frame = res.value;
        }
      })();
    } else {
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.srcObject = stream;
      void v.play().catch(() => {});
      this.video = v;
    }
  }

  stop(): void {
    this.generation++;
    void this.reader?.cancel().catch(() => {});
    this.reader = null;
    this.frame?.close();
    this.frame = null;
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  /** The newest frame and its size, or null when nothing is ready yet. */
  current(): { img: Drawable; w: number; h: number } | null {
    if (this.frame) return { img: this.frame, w: this.frame.displayWidth, h: this.frame.displayHeight };
    const v = this.video;
    if (v && v.readyState >= 2 && v.videoWidth) return { img: v, w: v.videoWidth, h: v.videoHeight };
    return null;
  }
}
