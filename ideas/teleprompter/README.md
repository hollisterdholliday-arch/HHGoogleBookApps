# Teleprompter (planned, not built yet)

Status: **idea, saved for later.** Don't build until the owner says go.

## The idea

Your script floats in a small window above everything, placed right under
your camera, so you can read naturally while recording lesson videos with
the Recorder (or on a live call).

## What we know so far

- **Who:** a high school teacher recording lessons; also shared with other
  teachers (mostly Windows, plus Googlebook and Mac).
- **Where:** a web app (PWA) in `web/teleprompter`, installed from GitHub
  Pages like the Recorder. Chrome or Edge.
- **Pairs with the Recorder:** reads while the Recorder records. Keep them as
  separate apps unless we decide otherwise.

## Feature ideas from the brainstorm

- Always-on-top floating script window (Chrome's Document Picture-in-Picture,
  the same as the Recorder's mini window), sized and placed under the camera.
- Scroll at a steady speed you set, or follow your voice (Chrome's on-device
  speech recognition) so it waits when you pause.
- Big readable text: font size, line width, mirror mode, high contrast.
- Start/pause/back with keyboard shortcuts (and a foot pedal or clicker if
  wanted later).
- Paste a script or open a text/Docs export; keep scripts in a folder you
  choose.

## Open questions (ask before building)

- Voice-follow, steady scroll, or both?
- Should it talk to the Recorder (e.g. start scrolling when recording starts,
  or show the script inside the Recorder's mini window)?
- Where do scripts come from: typed in the app, Google Docs, text files?
- Anything to show for each scene (cues like "switch to Lesson now")?

## Reuse from the Recorder

`web/recorder/src/ui/MiniWindow.tsx` (floating window),
`src/engine/captions.ts` (on-device speech), `src/lib/folder.ts` +
`src/lib/idb.ts` (saving to a folder), `src/lib/theme.ts` + `src/ui/styles.css`
(Material 3 Expressive look, accent colors), `vite.config.ts` (installable,
offline), `tests/smoke.mjs` (test setup), `.github/workflows/pages.yml`.

Rules: permissive licenses only (MIT, Apache-2.0, BSD, ISC); start blank, no
sample text; the user builds their own content.
