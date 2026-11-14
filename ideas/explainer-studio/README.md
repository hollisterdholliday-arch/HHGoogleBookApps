# Explainer Studio (planned, not built yet)

Status: **idea, saved for later.** Don't build until the owner says go.

## The idea

Make lesson videos that look like the polished explainer and tech videos on
YouTube (the famous channels' style): smooth motion, animated text and
shapes, zooms, callouts, music. Used for **micro-lessons**: short, focused
videos for students who work asynchronously, instead of long live-lesson
recordings. Subject right now is Earth science (diagrams, maps, cycles,
weather, time-lapses); little freehand drawing needed.

Polish happens **both while recording and afterwards**.

## Most important: control over motion

The owner's top priority is **more control over text, shapes and animation,
with smooth motion and movement of everything.**

- **Animate any layer** (text, shapes, images, camera, screen, tools):
  position, size, rotation, opacity, color, corner roundness, blur.
- **Keyframes on a timeline**, plus one-click presets (slide in, pop, rise,
  float, bounce, wipe, draw-on).
- **Easing that feels expensive:** springy Material 3 Expressive curves,
  smooth ease-in-out, overshoot, stagger (one after another).
- **Text animation:** word by word, letter by letter, typewriter, highlight
  sweep, count-up numbers, kinetic titles.
- **Shapes:** arrows and lines that draw themselves on, callout boxes,
  circles that circle things, **shape morphing** between the Expressive
  shapes (cookie → clover → circle).
- **Camera moves:** smooth zoom/pan into part of the screen, slides or a
  diagram; spotlight (dim everything else); slow pan-and-zoom on photos.
- **Motion everywhere stays smooth:** 60 fps preview where possible,
  sub-pixel motion, motion blur option.

## While recording (live polish)

- Trigger zooms, spotlight, callouts and text pop-ups with shortcuts or the
  mini window.
- Laser pointer / cursor highlight.
- Scenes already switch with springy transitions (Recorder).

## Afterwards (editor)

- Timeline: recording + layers for text, shapes, images/B-roll, music, sound
  effects, captions, zooms.
- Auto-tighten: cut silences and dead air.
- Styled animated captions.
- Music that ducks under your voice; whoosh/pop sound effects (owner's own
  or public-domain).
- Intro/outro templates from the brand kit.
- Export MP4 rendered on the computer (WebCodecs), faster than real time.

## Micro-lesson features (from the same brainstorm)

- **Micro-lesson mode:** plan a set, record back to back with Next, auto-name
  and file by unit, target length timer.
- **Lesson Pack** for async students: videos, PDF, HTML tool and quick check
  questions in one place. (Ask how videos reach students first.)
- Pairs with the [Teleprompter](../teleprompter/README.md).

## Known limits

- Exact word-by-word caption timing needs a speech model with a clean
  license; Chrome's built-in recognition gives phrase timing only.
- A web app can't see clicks in other apps, so zooms come from shortcuts or
  the editor, not automatic click-following.

## Open questions (ask before building)

- Editor as a new view in the Recorder, or a separate app?
- How micro-lessons get to students (Connexus upload, Drive, YouTube link)?
- Target video length?
- Which animation presets matter most to start?

## Build order when the time comes

1. Animation engine: keyframes + easing + presets for every layer type
   (shared by live and editor).
2. Text and shape animation, draw-on arrows, shape morphing.
3. Zoom/pan/spotlight (live shortcuts + editor).
4. Editor timeline, auto-tighten, export.
5. Captions, music/SFX, templates; micro-lesson mode; Lesson Pack.

Builds on `web/recorder` (compositor, scene builder, custom layers,
Expressive shapes in `src/engine/custom.ts`). Permissive licenses only; start
blank, no sample content.
