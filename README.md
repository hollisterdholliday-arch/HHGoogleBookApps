# HH Google Book Apps

Personal Android apps (APKs) built to run as desktop apps on a Lenovo
Googlebook (Intel), and on Android phones too.

Stack: **Kotlin + Jetpack Compose (Material 3)**, built with Gradle, with APKs
produced automatically by GitHub Actions.

## Layout

```
apps/                 one folder per app (apps/notes -> :apps:notes)
libs/                 shared code used by several apps (optional)
templates/starter/    template that new apps are copied from
build-logic/          shared build settings for every app (SDK levels, Compose, signing)
gradle/libs.versions.toml   all library versions in one place
keystore/debug.keystore     shared debug signing key (intentionally public)
scripts/              new-app.sh, create-release-keystore.sh
.github/workflows/    CI build + release publishing
docs/                 how-tos
```

Any folder under `apps/` with a `build.gradle.kts` is picked up
automatically; no settings changes needed.

## Common tasks

Create a new app:

```bash
scripts/new-app.sh notes "Notes"
```

Build it locally (needs JDK 21 and the Android SDK, e.g. via Android Studio):

```bash
./gradlew :apps:notes:assembleRelease
```

Get an APK without building locally: push to GitHub, open the **Actions** tab,
pick the latest **Build APKs** run and download the `apks-N` artifact.

Publish a version as a downloadable GitHub Release:

```bash
git tag notes-v1.0
```

```bash
git push origin notes-v1.0
```

## Docs

- [docs/INSTALLING.md](docs/INSTALLING.md): getting APKs onto the Googlebook
- [docs/NEW_APP.md](docs/NEW_APP.md): creating an app and designing it for a laptop screen
- [docs/SIGNING.md](docs/SIGNING.md): debug vs. release keys, and why it matters for updates
