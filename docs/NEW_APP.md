# Creating a new app

```bash
scripts/new-app.sh notes "Notes"
```

This copies `templates/starter` to `apps/notes`, sets the package to
`com.hh.notes`, and names the launcher icon "Notes". CI starts building it on
the next push.

## What every app gets for free

From the `hh.android.app` convention plugin (`build-logic/`):

- Kotlin + Jetpack Compose + Material 3, plus Material 3 adaptive helpers
- minSdk 29, target/compile SDK 36
- Shared debug signing, and release signing from secrets when configured
- `versionCode` taken from the CI run number, so every CI build can update the last one
- A `.debug` application ID suffix on debug builds, so debug and release can be installed side by side

## Designing for the Googlebook

The starter template is already set up for a laptop:

- **Opens as a large window.** `<layout android:defaultWidth="1200dp" ...>` in
  the manifest, and `resizeableActivity="true"`.
- **No touchscreen required.** `uses-feature touchscreen required=false`.
- **Adapts to window size.** Use `currentWindowAdaptiveInfo().windowSizeClass`
  to switch between a wide (laptop) and compact (phone, or narrow window) layout.
- **Doesn't restart on resize.** `configChanges` covers screen size and keyboard changes.

Things to add per app, as needed:

- Keyboard shortcuts: `Modifier.onPreviewKeyEvent { ... }` (Ctrl+N, Ctrl+F, etc.)
- Mouse hover and right-click: `Modifier.hoverable`, `pointerInput`
- List-detail layouts: `androidx.compose.material3.adaptive` navigation suites and panes
- Local database: Room is in the version catalog (`libs.room.*`, with the `ksp` plugin)

## Avoid

- **ARM-only native libraries (`.so` files)**. The Googlebook is Intel (x86_64).
  Pure Kotlin/Java libraries are fine everywhere. If a library ships native
  code, check that it includes `x86_64`.
- Locking orientation to portrait.
