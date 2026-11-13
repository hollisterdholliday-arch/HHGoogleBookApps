// Root build file. Plugins are declared here (apply false) so every module
// resolves the same versions from gradle/libs.versions.toml.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.compose.compiler) apply false
    alias(libs.plugins.ksp) apply false
}
