// Starter template. Don't edit this to build an app; run
//   scripts/new-app.sh <folder-name> "<Display Name>"
// which copies it into apps/. CI builds it to confirm the toolchain works.
plugins {
    alias(libs.plugins.hh.app)
}

android {
    namespace = "com.hh.starter"
    defaultConfig {
        applicationId = "com.hh.starter"
        versionName = "0.1"
    }
}

dependencies {
    // App-specific libraries go here, e.g.:
    // implementation(libs.compose.material.icons.extended)
}
