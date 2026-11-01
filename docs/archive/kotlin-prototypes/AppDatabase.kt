package com.sednium.kryptonide.data.storage

import android.content.Context
import com.sednium.kryptonide.utils.StorageUtils
import com.sednium.kryptonide.data.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File

// ─── Serializable wrappers ────────────────────────────────────

@Serializable
data class ProjectStore(val projects: List<Project> = emptyList())

@Serializable
data class FileStore(val files: List<FileNode> = emptyList())

@Serializable
data class ChatStore(
    val sessions: List<ChatSession> = emptyList(),
    val messages: List<ChatMessage> = emptyList(),
)

// ─── Simple JSON file database ────────────────────────────────

class AppDatabase(private val context: Context) {

    private val json = Json { ignoreUnknownKeys = true; prettyPrint = false }

    private val baseDir: File
        get() = try {
            val isManager = StorageUtils.isManagerSafe()
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R && isManager) {
                File(StorageUtils.getExternalStorageDir(), "KryptonIDE/.metadata").also { it.mkdirs() }
            } else {
                context.filesDir.also { it.mkdirs() }
            }
        } catch (e: Exception) {
            context.filesDir.also { it.mkdirs() }
        }

    private fun projectsFile() = File(baseDir, "projects.json")
    private fun filesFile(projectId: String) = File(baseDir, "files_$projectId.json")
    private fun chatFile(projectId: String) = File(baseDir, "chat_$projectId.json")

    /** The real on-disk directory holding projects.json/files_*.json/chat_*.json — see [baseDir]. */
    fun metadataDir(): File = baseDir

    // ── Projects ─────────────────────────────────────────────

    suspend fun getProjects(): List<Project> = withContext(Dispatchers.IO) {
        val f = projectsFile()
        if (!f.exists()) return@withContext emptyList()
        runCatching { json.decodeFromString<ProjectStore>(f.readText()).projects }.getOrElse { emptyList() }
    }

    suspend fun saveProject(project: Project) = withContext(Dispatchers.IO) {
        val projects = getProjects().toMutableList()
        val idx = projects.indexOfFirst { it.id == project.id }
        if (idx >= 0) projects[idx] = project else projects.add(project)
        projectsFile().writeText(json.encodeToString(ProjectStore(projects)))
    }

    suspend fun deleteProject(id: String) = withContext(Dispatchers.IO) {
        val projects = getProjects().filter { it.id != id }
        projectsFile().writeText(json.encodeToString(ProjectStore(projects)))
        filesFile(id).delete()
        chatFile(id).delete()
    }

    // ── Files ─────────────────────────────────────────────────

    suspend fun getFiles(projectId: String): List<FileNode> = withContext(Dispatchers.IO) {
        val f = filesFile(projectId)
        if (!f.exists()) return@withContext emptyList()
        runCatching { json.decodeFromString<FileStore>(f.readText()).files }.getOrElse { emptyList() }
    }

    suspend fun saveFiles(projectId: String, files: List<FileNode>) = withContext(Dispatchers.IO) {
        filesFile(projectId).writeText(json.encodeToString(FileStore(files)))
    }

    suspend fun upsertFile(file: FileNode) = withContext(Dispatchers.IO) {
        val files = getFiles(file.projectId).toMutableList()
        val idx = files.indexOfFirst { it.id == file.id }
        if (idx >= 0) files[idx] = file else files.add(file)
        saveFiles(file.projectId, files)
    }

    suspend fun deleteFile(projectId: String, fileId: String) = withContext(Dispatchers.IO) {
        val files = getFiles(projectId).filter { it.id != fileId }
        saveFiles(projectId, files)
    }

    // ── Chat ──────────────────────────────────────────────────

    suspend fun getChatStore(projectId: String): ChatStore = withContext(Dispatchers.IO) {
        val f = chatFile(projectId)
        if (!f.exists()) return@withContext ChatStore()
        runCatching { json.decodeFromString<ChatStore>(f.readText()) }.getOrElse { ChatStore() }
    }

    suspend fun saveChatStore(projectId: String, store: ChatStore) = withContext(Dispatchers.IO) {
        chatFile(projectId).writeText(json.encodeToString(store))
    }

    // ── Singleton ─────────────────────────────────────────────

    companion object {
        @Volatile private var instance: AppDatabase? = null
        fun getInstance(context: Context): AppDatabase =
            instance ?: synchronized(this) {
                instance ?: AppDatabase(context.applicationContext).also { instance = it }
            }
    }
}
