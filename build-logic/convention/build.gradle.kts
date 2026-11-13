plugins {
    `kotlin-dsl`
}

dependencies {
    compileOnly(libs.android.gradle.plugin)
    compileOnly(libs.kotlin.gradle.plugin)
    compileOnly(libs.compose.compiler.gradle.plugin)
}

gradlePlugin {
    plugins {
        register("hhAndroidApp") {
            id = "hh.android.app"
            implementationClass = "HhAndroidAppPlugin"
        }
    }
}
