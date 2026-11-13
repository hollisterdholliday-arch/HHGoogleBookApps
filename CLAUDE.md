# Notes for Claude

- Target device: Lenovo Googlebook 15 (Intel x86_64), Google Book OS. Apps are Android APKs used as desktop apps.
- Kotlin + Jetpack Compose only. No ARM-only native libraries.
- New apps: `scripts/new-app.sh <name> "<Label>"`. Apps apply `alias(libs.plugins.hh.app)`; shared config is in `build-logic/convention/src/main/kotlin/HhAndroidAppPlugin.kt`.
- Add dependency versions to `gradle/libs.versions.toml`, not inline.
- Design for large resizable windows, keyboard and mouse first (see docs/NEW_APP.md).
- CI (`.github/workflows/android.yml`) builds every module and uploads APKs; tags `<app>-v<version>` publish a release.
