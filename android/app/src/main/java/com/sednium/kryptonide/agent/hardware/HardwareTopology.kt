package com.sednium.kryptonide.agent.hardware

import android.app.ActivityManager
import android.content.Context
import android.util.Log
import java.io.File

data class CpuCore(
    val index: Int,
    val maxFreqKhz: Long,
    val isPerformanceCore: Boolean,
)

data class HardwareSnapshot(
    val cores: List<CpuCore>,
    val performanceCoreCount: Int,
    val peakFrequencyKhz: Long,
    val totalRamMb: Long,
    val availableRamMb: Long,
    val gpuVendor: String,
    val thermalCelsius: Float,
    val optimalThreadCount: Int,
) {
    /** Rough headroom check used before recommending a local model. */
    fun canHostModel(sizeBytes: Long): Boolean {
        val headroom = availableRamMb * 1024L * 1024L
        return headroom > sizeBytes * 1.35
    }

    fun thermalWarning(): Boolean = thermalCelsius >= 45f || availableRamMb < 512
}

/**
 * Reads CPU topology, memory and thermal state directly from sysfs so the
 * native agent can clamp thread counts and context sizes without waking the
 * WebView.
 */
object HardwareTopology {

    private const val TAG = "HardwareTopology"
    private const val CPU_ROOT = "/sys/devices/system/cpu"

    fun scan(context: Context? = null): HardwareSnapshot {
        val cores = readCores()
        val peak = cores.maxOfOrNull { it.maxFreqKhz } ?: 0L
        val performanceCores = cores.count { it.isPerformanceCore }.coerceAtLeast(1)
        val (totalMb, availableMb) = readMemory(context)
        val gpu = when (OortyNativeBridge.detectGpuVendor()) {
            2 -> "adreno"
            1 -> "mali"
            else -> "unknown"
        }
        val thermal = readThermal()
        val optimalThreads = OortyNativeBridge.optimalThreadCount(performanceCores)
            .coerceIn(1, maxOf(1, cores.size))

        return HardwareSnapshot(
            cores = cores,
            performanceCoreCount = performanceCores,
            peakFrequencyKhz = peak,
            totalRamMb = totalMb,
            availableRamMb = availableMb,
            gpuVendor = gpu,
            thermalCelsius = thermal,
            optimalThreadCount = optimalThreads,
        )
    }

    private fun readCores(): List<CpuCore> {
        val frequencies = ArrayList<Long>()
        for (index in 0..31) {
            val file = File("$CPU_ROOT/cpu$index/cpufreq/cpuinfo_max_freq")
            if (!file.exists()) {
                if (index > 0) break else continue
            }
            val freq = runCatching { file.readText().trim().toLong() }.getOrDefault(0L)
            frequencies += freq
        }
        if (frequencies.isEmpty()) {
            val fallback = Runtime.getRuntime().availableProcessors().coerceAtLeast(1)
            return (0 until fallback).map { CpuCore(it, 0L, true) }
        }
        val peak = frequencies.maxOrNull() ?: 0L
        val threshold = (peak * 0.85).toLong()
        return frequencies.mapIndexed { index, freq ->
            CpuCore(index, freq, peak > 0 && freq >= threshold)
        }
    }

    private fun readMemory(context: Context?): Pair<Long, Long> {
        if (context != null) {
            try {
                val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
                if (manager != null) {
                    val info = ActivityManager.MemoryInfo()
                    manager.getMemoryInfo(info)
                    return info.totalMem / (1024 * 1024) to info.availMem / (1024 * 1024)
                }
            } catch (e: Exception) {
                Log.w(TAG, "ActivityManager memory read failed", e)
            }
        }
        return parseMemInfo()
    }

    private fun parseMemInfo(): Pair<Long, Long> {
        return try {
            val text = File("/proc/meminfo").readText()
            val totalKb = Regex("""MemTotal:\s+(\d+)\s+kB""").find(text)?.groupValues?.get(1)?.toLongOrNull() ?: 0L
            val availableKb = Regex("""MemAvailable:\s+(\d+)\s+kB""").find(text)?.groupValues?.get(1)?.toLongOrNull()
                ?: Regex("""MemFree:\s+(\d+)\s+kB""").find(text)?.groupValues?.get(1)?.toLongOrNull()
                ?: 0L
            totalKb / 1024 to availableKb / 1024
        } catch (e: Exception) {
            0L to 0L
        }
    }

    private fun readThermal(): Float {
        val zones = File("/sys/class/thermal").listFiles { file -> file.name.startsWith("thermal_zone") } ?: return 0f
        var hottest = 0f
        zones.forEach { zone ->
            val raw = runCatching { File(zone, "temp").readText().trim().toFloatOrNull() }.getOrNull() ?: return@forEach
            val celsius = if (raw > 1000f) raw / 1000f else raw
            if (celsius in 0f..150f && celsius > hottest) hottest = celsius
        }
        return hottest
    }
}
