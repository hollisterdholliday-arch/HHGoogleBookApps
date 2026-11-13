// Timers in a hidden page are slowed to about once a second, but a worker's
// messages still arrive on time. The compositor draws on these ticks so the
// recording keeps a steady frame rate while you teach in another window.
let timer: ReturnType<typeof setInterval> | undefined;

self.onmessage = (e: MessageEvent<{ fps: number } | 'stop'>) => {
  if (timer) clearInterval(timer);
  timer = undefined;
  if (e.data !== 'stop') {
    timer = setInterval(() => (self as unknown as Worker).postMessage(0), 1000 / e.data.fps);
  }
};
