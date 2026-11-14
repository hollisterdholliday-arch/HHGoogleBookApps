# Tool Shelf (planned, not built yet)

Status: **idea, saved for later.** Don't build until the owner says go.

## The idea

One home for every interactive HTML tool the owner makes for class, from
"Claude just made this" to "students are using it": organize, try, version,
improve and publish.

## Main focus: an AI hub (Claude + Gemini)

The hub's top priority is **connecting Claude (makes the HTML) and Gemini
(makes videos; also Muse for video)** so videos can be built into the HTML
tools.

- Claude can read text, images and PDFs, **not video**. The hub bridges it:
  for each clip it makes a **video card**: a contact-sheet image of key
  frames, length/size, a written description (Gemini can watch video and
  writes it), and the exact file path to use (e.g. `media/clip.mp4`).
  Claude builds the HTML with real `<video>` players from those cards.
- The hub previews the tool with the actual videos playing, then saves it as
  a version.
- **Mode A (start here, no extra cost):** works with the owner's existing
  Claude and Gemini subscriptions through copy/paste hand-offs ("Copy for
  Gemini" description prompt, "Copy for Claude" instructions + video cards +
  contact sheets for the Claude project; paste results back).
- **Mode B (optional later):** direct connections to the Claude API and the
  Gemini API (generate video, describe it, build/edit the tool) without
  leaving the hub. Needs separate pay-per-use developer accounts (not
  included in subscriptions); keys stored only on the computer.
- Units publish as a folder: `index.html` + `media/`. GitHub's web upload
  takes files up to 25 MB each, so the hub shrinks videos to fit (reuse the
  Recorder's encoder).
- Open: what "Muse" is exactly; typical video length and kind.

## How the owner works today

- Tools are made with **Claude** (a Claude project per course); usually **one
  big all-in-one HTML file per unit** (games, study tools, practice), about
  **12 per semester**. A new course may be added next year.
- Tools live in **a folder on the computer**.
- Used mostly during **live lessons**; starting to give students a link via
  **GitHub Pages**.
- Video generation happens elsewhere (Gemini); not part of Tool Shelf for now.
- Private workshop: **sharing with colleagues is not a goal.**

## Design

1. **Shelf:** gallery with live thumbnails; organized **Course → Unit**; tags,
   favorites, search. Add by dropping a file or **pasting HTML from Claude**.
   The folder on the computer stays the source of truth (File System Access).
2. **Try & check:** open in a window; preview at Chromebook / laptop / phone
   sizes; health check for common AI-tool problems (outside scripts or CDNs,
   missing images, offline breakage, very large files).
3. **Versions:** every improvement is a new version; side-by-side compare;
   roll back; notes per tool (what it's for, what was asked).
4. **Ask Claude to change this:** copies the tool + instructions as a ready
   prompt for the Claude project; paste the reply back to save the next
   version. (Built-in AI later only if wanted; needs an API key.)
5. **Publish for students (manual, decided):** Tool Shelf stays 100% local
   and never signs in to GitHub. "Prepare for publishing" runs the checks,
   adds a no-search-engine tag, and saves a publish-ready copy with a stable
   name (e.g. `unit-04-plate-tectonics/index.html`) into a "Ready to publish"
   folder. The owner drags it into their existing tools site on GitHub
   (Add file → Upload files). Re-preparing and dragging over the old file
   keeps the student link the same.
6. **Use in Recorder:** send a tool to a Recorder scene.

## GitHub Pages facts (checked with the owner)

- No limit on simultaneous visitors; soft limits are 100 GB/month bandwidth
  and 1 GB per site. A 0.5–2 MB unit tool ≈ 50,000–200,000 opens/month.
- Static pages: no server, logins or data collection unless the HTML sends
  data somewhere (health check should flag outside requests).
- Public: anyone with the link can open it; answers inside HTML are visible
  via view-source, so use for practice/study, not graded work. Never put
  student information in tools. Check school rules on outside sites.

## Decided

- The owner already has a **dedicated tools site** on GitHub Pages (on a
  separate, school-managed GitHub account). Tool Shelf does not connect to
  it; publishing is a manual file drag.
- Master copies always live in Tool Shelf's local folder, so tools can be
  republished anywhere if that account or address ever changes.

## Open questions

- Should published tools keep working offline for students (installable)?
- Any stats wanted (e.g. how many opens)? GitHub Pages has none built in.

Builds on `web/recorder` pieces: folder access (`src/lib/folder.ts`,
`src/lib/idb.ts`), Expressive UI + accent colors, tool embedding
(`src/lib/tools.ts`), installable/offline setup, Pages workflow. Permissive
licenses only; start blank.
