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

What it does today:

- **11 scenes**, switched live with springy transitions: Welcome, Lesson,
  Side by side, Just me, Screen only, Presenter, Tool + me, Two screens,
  Try this (with a live 1-minute timer), Be right back, Outro.
- **Screen, tab or window sharing** (with its sound), plus a second shared
  window for Two screens.
- **Camera effects**: background blur, replace (presets or your photo),
  remove; auto-framing; light fix.
- **PDF slides** (PowerPoint / Google Slides / Keynote saved as PDF).
- **Teaching tools**: your HTML files and links run inside the recorder and
  are recorded live (choose “This tab” when Chrome asks).
- **Mini window** that floats above other apps for switching scenes,
  flipping slides and stopping.
- Records **1080p MP4** straight into the folder you pick. Works offline once
  installed.

Shortcuts (while the recorder or its mini window is in front):

| Action | Keys |
|---|---|
| Switch scene | `1`–`9` (or Ctrl + number) |
| Next / previous slide | → / ← |
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
