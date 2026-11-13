# Installing APKs on the Googlebook

## 1. Get the APK

- **Latest build of everything:** GitHub -> **Actions** -> latest **Build APKs**
  run -> download the `apks-N` artifact (a zip; extract it). Use the
  `-release.apk` file.
- **A published version:** GitHub -> **Releases** -> download `<app>-<version>.apk`.

## 2. Allow installing apps from outside the Play Store

Google Book OS is new, and Google hasn't documented sideloading for it yet in
anything we've checked. These are the methods to try, in order. Update this
file with whatever works.

1. **Open the APK directly.** Double-click the downloaded `.apk` in the Files
   app. Android-based systems usually ask once to allow installs from that app
   ("Install unknown apps"); allow it, then install.
2. **Developer options.** In Settings, look for *Developers* / *Android
   developer options* / *Developer options* and turn on **ADB debugging** or
   **Install from unknown sources**. (On ChromeOS this was Settings ->
   Apps -> Google Play Store -> Manage Android preferences -> Developer
   options, or Settings -> Developers -> Android -> Develop Android apps.)
3. **ADB from the Linux terminal** (if the Linux environment is available):
   install `adb`, connect, and run `adb install -r path/to/app.apk`. `-r`
   updates an existing install and keeps its data.

## Updating an app

Install the newer APK over the old one. It keeps your data as long as it was
signed with the same key and has a higher version code; CI builds handle both.
See [SIGNING.md](SIGNING.md).
