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

What it does:

- **11 built-in scenes**, switched live with springy transitions: Welcome,
  Lesson, Side by side, Just me, Screen only, Presenter, Tool + me, Two
  screens, Try this (live 1-minute timer), Be right back, Outro.
- **Scene builder**: your own scenes with camera, screens, teaching tool,
  text (with {title}/{name}/{role}/{date}), pictures, looping videos,
  shapes and timers; eight outline shapes including Expressive cookie,
  clover, burst and arch; looping-video or animated backgrounds; layers
  behind or in front of you. The preview is the real recorder.
- **Screen, tab or window sharing** (with sound) plus a second window.
- **Camera effects**: blur, replace, remove; auto-framing; light fix.
- **PDF slides** and **teaching tools** (your HTML files and links, live).
- **Mini window** that floats above other apps.
- **Library**: thumbnails, player, chapters from scene switches, lossless
  trim, rename, delete, captions.
- **Live captions** (Chrome's on-device speech) saved as .vtt and .srt.
- **Settings**: quality, countdown, audio clean-up, theme, accent color
  (Material You), glass, motion, **brand kit** (name bar colors, font,
  logo), **scene packs** to share with other teachers.
- **Welcome tour** for first-time users. Records **1080p MP4** straight
  into the folder you pick. Installs as an app and works offline.

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
