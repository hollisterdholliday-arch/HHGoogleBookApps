# Recorder

Record lesson videos with your screen, camera and live scene switching.
Runs in Chrome or Microsoft Edge on Googlebook, Chromebook, Windows and Mac,
and installs as an app. Everything is processed on your computer; nothing is
uploaded.

## Use it

Open the published link in Chrome or Edge, then click the install icon in the
address bar. Allow the camera and microphone, click **Share screen**, pick
your scenes and press **Record**. The first time you record, choose the folder
your videos should be saved to.

Shortcuts (while the recorder is in front):

| Action | Keys |
|---|---|
| Switch scene | `1`–`8` (or Ctrl + number) |
| Start / stop recording | Ctrl + Shift + Enter |
| Pause / resume | Ctrl + Shift + Space |

## Develop

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build && npm test
```

`npm test` runs the built app in real Chromium with a fake camera, shares a
fake screen, switches scenes, records a few seconds and checks the MP4.

## How it works

- `src/engine/compositor.ts` draws the 1920×1080 stage on a canvas; the same
  canvas is the preview and the recording, so what you see is what you get.
- `src/engine/sources.ts` reads camera and screen frames with
  `MediaStreamTrackProcessor`, and `ticker.worker.ts` drives drawing from a
  worker, so recording keeps going while the window is hidden.
- `src/engine/recorder.ts` encodes with `MediaRecorder` (H.264/AAC MP4 on
  Chrome) and streams the file straight into the chosen folder.
