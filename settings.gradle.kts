pluginManagement {
    includeBuild("build-logic")
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "HHGoogleBookApps"

// Auto-discover modules: any folder under apps/, libs/ or templates/ that has
// a build.gradle.kts becomes a module (e.g. apps/notes -> :apps:notes).
// No need to edit this file when adding a new app.
listOf("apps", "libs", "templates").forEach { group ->
    file(group).listFiles()
        ?.filter { it.isDirectory && File(it, "build.gradle.kts").exists() }
        ?.sortedBy { it.name }
        ?.forEach { include(":$group:${it.name}") }
}
