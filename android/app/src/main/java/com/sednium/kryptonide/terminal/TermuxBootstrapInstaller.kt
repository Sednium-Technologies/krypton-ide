package com.sednium.kryptonide.terminal

import android.content.Context
import android.os.Build
import android.system.Os
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.BufferedReader
import java.io.File
import java.io.FileOutputStream
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.ZipInputStream

/**
 * Manages detection, download, extraction, and permission setup
 * of the Termux rootfs bootstrap userland.
 */
class TermuxBootstrapInstaller(private val context: Context) {

    companion object {
        private const val TAG = "TermuxInstaller"
        const val PREFIX_PATH = "/data/data/com.sednium.kryptonide.legacy/files/usr"
        const val HOME_PATH = "/data/data/com.sednium.kryptonide.legacy/files/home"
        const val TMP_PATH = "/data/data/com.sednium.kryptonide.legacy/files/usr/tmp"

        // Official Termux packages releases
        private const val BASE_URL_GITHUB = "https://github.com/termux/termux-packages/releases/download/bootstrap-2024.11.18-r1%2Bapt-android-7"
        private const val BASE_URL_LATEST = "https://github.com/termux/termux-packages/releases/latest/download"
        private const val BASE_URL_MIRROR = "https://packages.termux.dev/bootstrap"
    }

    val filesDir: File get() = context.filesDir
    val usrDir: File get() = File(filesDir, "usr")
    val homeDir: File get() = File(filesDir, "home")
    val tmpDir: File get() = File(usrDir, "tmp")
    val binDir: File get() = File(usrDir, "bin")

    /**
     * Determines target Termux architecture string based on device ABIs.
     */
    fun determineArch(): String {
        for (abi in Build.SUPPORTED_ABIS) {
            when (abi) {
                "arm64-v8a" -> return "aarch64"
                "armeabi-v7a", "armeabi" -> return "arm"
                "x86_64" -> return "x86_64"
                "x86" -> return "i686"
            }
        }
        return "aarch64"
    }

    /**
     * Checks if Termux bootstrap is installed and functional.
     */
    fun isInstalled(): Boolean {
        val bash = File(binDir, "bash")
        val sh = File(binDir, "sh")
        return (bash.exists() && bash.canExecute()) || (sh.exists() && sh.canExecute())
    }

    fun hasBash(): Boolean = File(binDir, "bash").exists()
    fun hasPython(): Boolean = File(binDir, "python3").exists() || File(binDir, "python").exists()
    fun hasRust(): Boolean = File(binDir, "rustc").exists()
    fun hasNode(): Boolean = File(binDir, "node").exists()
    fun hasClang(): Boolean = File(binDir, "clang").exists()

    /**
     * Ensures mandatory runtime directories exist.
     */
    fun ensureDirectories() {
        if (!filesDir.exists()) filesDir.mkdirs()
        if (!usrDir.exists()) usrDir.mkdirs()
        if (!homeDir.exists()) homeDir.mkdirs()
        if (!tmpDir.exists()) tmpDir.mkdirs()
        if (!binDir.exists()) binDir.mkdirs()
        File(usrDir, "lib").mkdirs()
        File(usrDir, "etc").mkdirs()
    }

    /**
     * Downloads and installs the Termux bootstrap archive.
     * Reports progress via callback: (status, percentage 0..100, message).
     */
    suspend fun installBootstrap(
        onProgress: (status: String, progress: Int, message: String) -> Unit
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            ensureDirectories()
            val arch = determineArch()
            onProgress("checking", 0, "Checking device architecture: $arch")

            val downloadUrls = listOf(
                "$BASE_URL_GITHUB/bootstrap-$arch.zip",
                "$BASE_URL_LATEST/bootstrap-$arch.zip",
                "$BASE_URL_MIRROR/bootstrap-$arch.zip"
            )

            val tempZipFile = File(context.cacheDir, "termux-bootstrap-$arch.zip")
            if (tempZipFile.exists()) {
                tempZipFile.delete()
            }

            var downloaded = false
            for (urlStr in downloadUrls) {
                try {
                    onProgress("downloading", 5, "Connecting to bootstrap mirror...")
                    downloadFileWithRedirects(urlStr, tempZipFile) { downloadedBytes, totalBytes ->
                        val pct = if (totalBytes > 0) {
                            5 + ((downloadedBytes * 45) / totalBytes).toInt()
                        } else {
                            25
                        }
                        val mbDownloaded = downloadedBytes / (1024 * 1024)
                        val mbTotal = if (totalBytes > 0) totalBytes / (1024 * 1024) else 0
                        val msg = if (mbTotal > 0) {
                            "Downloading Termux ecosystem ($mbDownloaded MB / $mbTotal MB)..."
                        } else {
                            "Downloading Termux ecosystem ($mbDownloaded MB)..."
                        }
                        onProgress("downloading", pct.coerceIn(5, 50), msg)
                    }
                    if (tempZipFile.exists() && tempZipFile.length() > 1024 * 1024) {
                        downloaded = true
                        break
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Failed downloading from $urlStr: ${e.message}")
                }
            }

            if (!downloaded || !tempZipFile.exists()) {
                onProgress("error", -1, "Failed to download Termux bootstrap from available mirrors.")
                return@withContext false
            }

            onProgress("extracting", 52, "Unpacking Termux rootfs userland...")
            val symlinkContent = StringBuilder()

            // Unpack ZIP archive
            ZipInputStream(tempZipFile.inputStream().buffered()).use { zis ->
                var entry = zis.nextEntry
                var extractedCount = 0
                val buffer = ByteArray(8192)

                while (entry != null) {
                    val entryName = entry.name

                    // Prevent Zip Slip vulnerability
                    if (entryName.contains("..")) {
                        entry = zis.nextEntry
                        continue
                    }

                    if (entryName == "SYMLINKS.txt" || entryName.endsWith("/SYMLINKS.txt")) {
                        // Read symlinks manifest
                        val reader = BufferedReader(InputStreamReader(zis, Charsets.UTF_8))
                        var line: String? = reader.readLine()
                        while (line != null) {
                            symlinkContent.append(line).append("\n")
                            line = reader.readLine()
                        }
                    } else {
                        // Normalize destination under usrDir or filesDir
                        val targetFile = if (entryName.startsWith("usr/")) {
                            File(filesDir, entryName)
                        } else {
                            File(usrDir, entryName)
                        }

                        if (entry.isDirectory) {
                            targetFile.mkdirs()
                        } else {
                            targetFile.parentFile?.mkdirs()
                            FileOutputStream(targetFile).use { fos ->
                                var bytes = zis.read(buffer)
                                while (bytes != -1) {
                                    fos.write(buffer, 0, bytes)
                                    bytes = zis.read(buffer)
                                }
                            }

                            // If binary or library, make executable
                            if (targetFile.parentFile?.name == "bin" || targetFile.parentFile?.name == "libexec") {
                                targetFile.setExecutable(true, false)
                                targetFile.setReadable(true, false)
                            }
                        }
                    }

                    extractedCount++
                    if (extractedCount % 100 == 0) {
                        val pct = 52 + ((extractedCount * 38) / 3000).coerceAtMost(38)
                        onProgress("extracting", pct, "Extracted $extractedCount files...")
                    }

                    zis.closeEntry()
                    entry = zis.nextEntry
                }
            }

            // Cleanup temp zip
            try {
                tempZipFile.delete()
            } catch (_: Exception) {}

            onProgress("configuring", 92, "Creating symbolic links...")
            processSymlinks(symlinkContent.toString())

            onProgress("configuring", 96, "Setting executable permissions on binaries...")
            setPermissionsRecursively(binDir)
            val libexecDir = File(usrDir, "libexec")
            if (libexecDir.exists()) {
                setPermissionsRecursively(libexecDir)
            }

            // Ensure /usr/bin/sh exists
            val bashFile = File(binDir, "bash")
            val shFile = File(binDir, "sh")
            if (bashFile.exists() && !shFile.exists()) {
                try {
                    Os.symlink("bash", shFile.absolutePath)
                } catch (_: Exception) {
                    try {
                        bashFile.copyTo(shFile, overwrite = true)
                        shFile.setExecutable(true, false)
                    } catch (_: Exception) {}
                }
            }

            onProgress("ready", 100, "Termux Linux environment installed successfully!")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Bootstrap installation failed", e)
            onProgress("error", -1, "Installation error: ${e.message}")
            false
        }
    }

    private fun downloadFileWithRedirects(
        initialUrl: String,
        outputFile: File,
        onProgress: (downloaded: Long, total: Long) -> Unit
    ) {
        var currentUrl = initialUrl
        var redirects = 0
        val maxRedirects = 10

        while (redirects < maxRedirects) {
            val url = URL(currentUrl)
            val connection = url.openConnection() as HttpURLConnection
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 15000
            connection.readTimeout = 30000
            connection.setRequestProperty("User-Agent", "KryptonIDE-BootstrapInstaller")

            val responseCode = connection.responseCode
            if (responseCode in 300..399) {
                val newLocation = connection.getHeaderField("Location")
                connection.disconnect()
                if (newLocation != null) {
                    currentUrl = if (newLocation.startsWith("http")) newLocation else URL(url, newLocation).toString()
                    redirects++
                    continue
                }
            }

            if (responseCode != HttpURLConnection.HTTP_OK) {
                connection.disconnect()
                throw Exception("HTTP request failed with status code $responseCode")
            }

            val totalBytes = connection.contentLength.toLong()
            var downloadedBytes = 0L

            connection.inputStream.buffered().use { input ->
                FileOutputStream(outputFile).use { output ->
                    val buffer = ByteArray(8192)
                    var bytes = input.read(buffer)
                    while (bytes != -1) {
                        output.write(buffer, 0, bytes)
                        downloadedBytes += bytes
                        onProgress(downloadedBytes, totalBytes)
                        bytes = input.read(buffer)
                    }
                }
            }

            connection.disconnect()
            return
        }
        throw Exception("Too many redirects: $redirects")
    }

    private fun processSymlinks(content: String) {
        if (content.isBlank()) return
        val lines = content.lines()
        for (line in lines) {
            val trimmed = line.trim()
            if (trimmed.isEmpty()) continue

            // Termux SYMLINKS.txt format uses left arrow U+2190 "←" or tab or "->"
            val delimiter = when {
                trimmed.contains("←") -> "←"
                trimmed.contains("->") -> "->"
                trimmed.contains("\t") -> "\t"
                else -> null
            } ?: continue

            val parts = trimmed.split(delimiter)
            if (parts.size != 2) continue

            val p0 = parts[0].trim()
            val p1 = parts[1].trim()

            // In Termux SYMLINKS.txt:
            // Format is: target←symlink_path (e.g., ../usr/bin/bash←bin/sh or bash←bin/sh)
            val linkTarget = p0
            val linkPathStr = p1

            val linkFile = if (linkPathStr.startsWith("usr/")) {
                File(filesDir, linkPathStr)
            } else {
                File(usrDir, linkPathStr)
            }

            linkFile.parentFile?.mkdirs()
            if (linkFile.exists() || isSymlink(linkFile)) {
                linkFile.delete()
            }

            try {
                Os.symlink(linkTarget, linkFile.absolutePath)
            } catch (e: Exception) {
                // If order was swapped in archive, attempt fallback
                try {
                    val fallbackFile = File(usrDir, p0)
                    fallbackFile.parentFile?.mkdirs()
                    if (fallbackFile.exists() || isSymlink(fallbackFile)) fallbackFile.delete()
                    Os.symlink(p1, fallbackFile.absolutePath)
                } catch (e2: Exception) {
                    Log.w(TAG, "Failed creating symlink '$linkTarget' -> '${linkFile.absolutePath}': ${e.message}")
                }
            }
        }
    }

    private fun isSymlink(file: File): Boolean {
        return try {
            val canon = file.canonicalPath
            val abs = file.absolutePath
            canon != abs
        } catch (_: Exception) {
            false
        }
    }

    private fun setPermissionsRecursively(directory: File) {
        if (!directory.exists() || !directory.isDirectory) return
        val files = directory.listFiles() ?: return
        for (file in files) {
            if (file.isDirectory) {
                setPermissionsRecursively(file)
            } else {
                try {
                    // chmod 755 (rwxr-xr-x) = 493 decimal
                    Os.chmod(file.absolutePath, 493)
                    file.setReadable(true, false)
                    file.setExecutable(true, false)
                } catch (e: Exception) {
                    file.setReadable(true, false)
                    file.setExecutable(true, false)
                }
            }
        }
    }
}
