# Notes for Claude

- App ideas the owner is considering live in `ideas/` (one folder each). Don't build them until asked.

- Web apps live in `web/<app>` (Vite + React + TypeScript, Chrome/Edge first). Use only permissively licensed dependencies (MIT, Apache-2.0, BSD, ISC); no GPL/AGPL. Build: `npm run build`; smoke test: `npm test` (real Chromium, fake camera). `.github/workflows/pages.yml` publishes `web/` to GitHub Pages from main.

- The owner now uses a MacBook Pro (Chrome); web apps must work in Chrome/Edge on Mac and Windows. (Originally built for a Lenovo Googlebook 15; the Android/APK setup below is still available but unused.)
- Kotlin + Jetpack Compose only. No ARM-only native libraries.
- New apps: `scripts/new-app.sh <name> "<Label>"`. Apps apply `alias(libs.plugins.hh.app)`; shared config is in `build-logic/convention/src/main/kotlin/HhAndroidAppPlugin.kt`.
- Add dependency versions to `gradle/libs.versions.toml`, not inline.
- Design for large resizable windows, keyboard and mouse first (see docs/NEW_APP.md).
- CI (`.github/workflows/android.yml`) builds every module and uploads APKs; tags `<app>-v<version>` publish a release.
