import com.android.build.api.dsl.ApplicationExtension
import org.gradle.api.JavaVersion
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.artifacts.VersionCatalogsExtension
import org.gradle.kotlin.dsl.configure
import org.gradle.kotlin.dsl.dependencies
import org.gradle.kotlin.dsl.getByType

/**
 * Shared setup for every app in apps/. An app's build.gradle.kts only needs:
 *
 *   plugins { alias(libs.plugins.hh.app) }
 *   android {
 *       namespace = "com.hh.myapp"
 *       defaultConfig { applicationId = "com.hh.myapp"; versionName = "1.0" }
 *   }
 *
 * This plugin applies Android + Kotlin + Jetpack Compose, sets SDK levels,
 * wires up signing (see docs/SIGNING.md) and adds the standard Compose
 * dependencies.
 */
class HhAndroidAppPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        // AGP 9 has Kotlin support built in, so only the Compose compiler is added.
        pluginManager.apply("com.android.application")
        pluginManager.apply("org.jetbrains.kotlin.plugin.compose")

        val libs = extensions.getByType<VersionCatalogsExtension>().named("libs")
        val keystoreDir = rootProject.layout.projectDirectory.dir("keystore")

        extensions.configure<ApplicationExtension> {
            compileSdk = 37

            defaultConfig {
                minSdk = 29
                targetSdk = 37
                // Android only installs an update if versionCode goes up.
                // CI passes its run number; local builds default to 1.
                versionCode = providers.environmentVariable("HH_VERSION_CODE")
                    .orNull?.toIntOrNull() ?: 1
                versionName = "0.1"
            }

            signingConfigs {
                // Shared debug key committed to the repo so every build (local
                // or CI) has the same signature and installs over the last one.
                getByName("debug") {
                    storeFile = keystoreDir.file("debug.keystore").asFile
                    storePassword = "android"
                    keyAlias = "androiddebugkey"
                    keyPassword = "android"
                }
                // Real release key, only when provided via environment
                // variables (CI secrets or your shell). Never committed.
                val releaseStore = providers.environmentVariable("HH_KEYSTORE_FILE").orNull
                if (releaseStore != null) {
                    create("release") {
                        storeFile = file(releaseStore)
                        storePassword = providers.environmentVariable("HH_KEYSTORE_PASSWORD").orNull
                        keyAlias = providers.environmentVariable("HH_KEY_ALIAS").orNull
                        keyPassword = providers.environmentVariable("HH_KEY_PASSWORD").orNull
                    }
                }
            }

            buildTypes {
                getByName("debug") {
                    applicationIdSuffix = ".debug"
                    versionNameSuffix = "-debug"
                }
                getByName("release") {
                    isMinifyEnabled = false
                    signingConfig = signingConfigs.findByName("release")
                        ?: signingConfigs.getByName("debug")
                }
            }

            compileOptions {
                sourceCompatibility = JavaVersion.VERSION_17
                targetCompatibility = JavaVersion.VERSION_17
            }

            buildFeatures {
                compose = true
            }

            packaging {
                resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
            }
        }

        dependencies {
            val bom = platform(libs.findLibrary("compose-bom").get())
            add("implementation", bom)
            add("implementation", libs.findLibrary("androidx-core-ktx").get())
            add("implementation", libs.findLibrary("androidx-activity-compose").get())
            add("implementation", libs.findLibrary("androidx-lifecycle-runtime-compose").get())
            add("implementation", libs.findLibrary("compose-ui").get())
            add("implementation", libs.findLibrary("compose-ui-tooling-preview").get())
            add("implementation", libs.findLibrary("compose-material3").get())
            add("implementation", libs.findLibrary("compose-material3-adaptive").get())
            add("debugImplementation", libs.findLibrary("compose-ui-tooling").get())
        }
    }
}
