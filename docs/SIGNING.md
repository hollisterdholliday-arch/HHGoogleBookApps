# Signing

Android only installs an update over an existing app if **both**:

1. the new APK is signed with the **same key**, and
2. its `versionCode` is **higher**.

If either fails, you have to uninstall the old version first, which deletes
the app's data.

## Debug key (works out of the box)

`keystore/debug.keystore` is committed on purpose. It's a throwaway key with
the standard Android password (`android`), shared by every local and CI build
so they can update each other. It protects nothing, and it doesn't need to.

Until a release key is set up, **release builds are signed with this debug
key too**. That's fine for personal sideloaded apps.

## Release key (optional, do this before you rely on an app)

A private key, needed if you ever publish to the Play Store or want APKs
nobody else could forge.

1. On any computer with a JDK: `scripts/create-release-keystore.sh`
2. Add the four secrets it prints under GitHub repo **Settings -> Secrets and
   variables -> Actions**.
3. Back up the `.jks` file and password somewhere safe (a password manager).

CI uses the release key automatically once the secrets exist.

**Heads-up:** switching an already-installed app from the debug key to the
release key is a key change, so uninstall and reinstall once (export any data
first).
