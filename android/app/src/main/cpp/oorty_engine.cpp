#include <jni.h>

#include <android/log.h>
#include <dirent.h>
#include <sched.h>
#include <unistd.h>

#include <algorithm>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <string>
#include <thread>
#include <vector>

#define LOG_TAG "OortyNative"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN, LOG_TAG, __VA_ARGS__)

namespace {

constexpr const char* kCpuRoot = "/sys/devices/system/cpu";

long readMaxFreqKhz(int cpuIndex) {
    char path[160];
    std::snprintf(path, sizeof(path),
                  "%s/cpu%d/cpufreq/cpuinfo_max_freq", kCpuRoot, cpuIndex);
    std::ifstream stream(path);
    long value = 0;
    if (stream.is_open()) {
        stream >> value;
    }
    return value;
}

std::vector<long> readAllFrequencies() {
    std::vector<long> frequencies;
    for (int index = 0; index < 32; ++index) {
        const long freq = readMaxFreqKhz(index);
        if (freq <= 0) {
            if (index > 0) break;
            continue;
        }
        frequencies.push_back(freq);
    }
    return frequencies;
}

int detectPerformanceCores() {
    const std::vector<long> frequencies = readAllFrequencies();
    if (frequencies.empty()) {
        return std::max(1, static_cast<int>(std::thread::hardware_concurrency()));
    }
    const long peak = *std::max_element(frequencies.begin(), frequencies.end());
    const long threshold = static_cast<long>(peak * 0.85);
    int count = 0;
    for (const long freq : frequencies) {
        if (freq >= threshold) ++count;
    }
    return std::max(1, count);
}

int pickPerformanceCore(int threadIdx) {
    const std::vector<long> frequencies = readAllFrequencies();
    if (frequencies.empty()) {
        const int cores = std::max(1, static_cast<int>(std::thread::hardware_concurrency()));
        return threadIdx % cores;
    }
    const long peak = *std::max_element(frequencies.begin(), frequencies.end());
    const long threshold = static_cast<long>(peak * 0.85);
    std::vector<int> performance;
    for (size_t i = 0; i < frequencies.size(); ++i) {
        if (frequencies[i] >= threshold) performance.push_back(static_cast<int>(i));
    }
    if (performance.empty()) {
        return threadIdx % static_cast<int>(frequencies.size());
    }
    return performance[threadIdx % performance.size()];
}

}  // namespace

extern "C" JNIEXPORT jint JNICALL
Java_com_sednium_kryptonide_agent_hardware_OortyNativeBridge_nativeGetOptimalThreadCount(
        JNIEnv*, jclass) {
    return detectPerformanceCores();
}

extern "C" JNIEXPORT jint JNICALL
Java_com_sednium_kryptonide_agent_hardware_OortyNativeBridge_nativeGetPerformanceCoreCount(
        JNIEnv*, jclass) {
    return detectPerformanceCores();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_sednium_kryptonide_agent_hardware_OortyNativeBridge_nativeBindThreadToBigCores(
        JNIEnv*, jclass, jint threadIdx) {
    const int core = pickPerformanceCore(threadIdx);
    cpu_set_t set;
    CPU_ZERO(&set);
    CPU_SET(core, &set);
    const int result = sched_setaffinity(0, sizeof(cpu_set_t), &set);
    if (result != 0) {
        LOGW("sched_setaffinity failed for core %d", core);
        return JNI_FALSE;
    }
    return JNI_TRUE;
}

extern "C" JNIEXPORT jint JNICALL
Java_com_sednium_kryptonide_agent_hardware_OortyNativeBridge_nativeDetectGpuVendor(
        JNIEnv*, jclass) {
    if (access("/dev/kgsl-3d0", F_OK) == 0) return 2;  // Qualcomm Adreno
    if (access("/dev/mali0", F_OK) == 0) return 1;     // ARM Mali
    return 0;
}
