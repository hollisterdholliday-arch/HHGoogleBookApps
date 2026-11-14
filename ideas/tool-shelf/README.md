# Tool Shelf (planned, not built yet)

Status: **idea, saved for later.** Don't build until the owner says go.

## The idea

One home for every interactive HTML tool the owner makes for class, from
"Claude just made this" to "students are using it": organize, try, version,
improve and publish.

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
5. **Publish for students:** one click "Get student link" on GitHub Pages
   (ideally a separate lessons repo/site); the link stays the same when the
   tool is updated; unpublish anytime; optional one-link-per-unit page; add a
   no-search-engine tag; pre-publish checks.
6. **Use in Recorder:** send a tool to a Recorder scene.

## GitHub Pages facts (checked with the owner)

- No limit on simultaneous visitors; soft limits are 100 GB/month bandwidth
  and 1 GB per site. A 0.5–2 MB unit tool ≈ 50,000–200,000 opens/month.
- Static pages: no server, logins or data collection unless the HTML sends
  data somewhere (health check should flag outside requests).
- Public: anyone with the link can open it; answers inside HTML are visible
  via view-source, so use for practice/study, not graded work. Never put
  student information in tools. Check school rules on outside sites.

## Open questions

- Separate lessons repo/site for published tools? (Recommended.)
- Publishing needs GitHub access from the app (a fine-grained token stored on
  the computer) or a manual "download + upload" step. Which?
- Should published tools keep working offline for students (installable)?
- Any stats wanted (e.g. how many opens)? GitHub Pages has none built in.

Builds on `web/recorder` pieces: folder access (`src/lib/folder.ts`,
`src/lib/idb.ts`), Expressive UI + accent colors, tool embedding
(`src/lib/tools.ts`), installable/offline setup, Pages workflow. Permissive
licenses only; start blank.
