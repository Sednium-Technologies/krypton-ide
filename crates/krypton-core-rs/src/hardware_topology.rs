use byteorder::{LittleEndian, ReadBytesExt};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Cursor;
use std::path::Path;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct CpuCoreInfo {
    pub core_id: usize,
    pub max_freq_khz: u64,
    pub is_big_core: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct HardwareTopology {
    pub total_cores: usize,
    pub big_cores: Vec<usize>,
    pub little_cores: Vec<usize>,
    pub peak_frequency_khz: u64,
    pub optimal_thread_count: usize,
    pub gpu_device: Option<String>,
    pub gpu_vendor: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct GgufHeaderInfo {
    pub magic: String,
    pub version: u32,
    pub tensor_count: u64,
    pub metadata_kv_count: u64,
    pub architecture: Option<String>,
    pub context_length: Option<u64>,
}

/// Parses CPU frequencies from a sysfs directory (e.g., `/sys/devices/system/cpu`).
pub fn parse_cpu_frequencies<P: AsRef<Path>>(sysfs_cpu_dir: P) -> Vec<(usize, u64)> {
    let mut results = Vec::new();
    let dir = sysfs_cpu_dir.as_ref();

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let file_name = entry.file_name();
            let name_str = file_name.to_string_lossy();

            if let Some(stripped) = name_str.strip_prefix("cpu") {
                if let Ok(core_id) = stripped.parse::<usize>() {
                    let path = entry.path();
                    let freq_paths = [
                        path.join("cpufreq/cpuinfo_max_freq"),
                        path.join("cpufreq/scaling_max_freq"),
                        path.join("cpuinfo_max_freq"),
                    ];

                    for fp in &freq_paths {
                        if let Ok(content) = fs::read_to_string(fp) {
                            if let Ok(freq) = content.trim().parse::<u64>() {
                                results.push((core_id, freq));
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    results.sort_by_key(|&(id, _)| id);
    results
}

/// Classifies CPU cores into Big/Performance cores vs Little/Efficiency cores.
/// Big cores are defined as having maximum frequency >= 85% of peak frequency.
pub fn calculate_big_cores(cores: &[(usize, u64)]) -> (Vec<usize>, Vec<usize>, u64) {
    if cores.is_empty() {
        return (Vec::new(), Vec::new(), 0);
    }

    let peak = cores.iter().map(|&(_, freq)| freq).max().unwrap_or(0);
    let threshold = (peak * 85) / 100;

    let mut big = Vec::new();
    let mut little = Vec::new();

    for &(id, freq) in cores {
        if freq >= threshold {
            big.push(id);
        } else {
            little.push(id);
        }
    }

    (big, little, peak)
}

/// Detects mobile/desktop GPU acceleration hardware nodes.
pub fn detect_gpu_acceleration() -> (Option<String>, String) {
    let gpu_nodes = [
        ("/dev/kgsl-3d0", "Qualcomm Adreno GPU (Hardware Accelerated)"),
        ("/dev/mali0", "ARM Mali GPU (Hardware Accelerated)"),
        ("/dev/nvhost-gpu", "NVIDIA Tegra GPU (Hardware Accelerated)"),
        ("/dev/dri/renderD128", "Direct Rendering Manager (Vulkan / DRM)"),
    ];

    for (node, vendor) in gpu_nodes {
        if Path::new(node).exists() {
            return (Some(node.to_string()), vendor.to_string());
        }
    }

    (None, "Standard CPU / Software Rasterizer".to_string())
}

/// Comprehensive hardware topology detection.
pub fn detect_cpu_topology() -> HardwareTopology {
    let parsed_cores = parse_cpu_frequencies("/sys/devices/system/cpu");
    let (big, little, peak) = if !parsed_cores.is_empty() {
        calculate_big_cores(&parsed_cores)
    } else {
        // Fallback when sysfs is unreadable
        let total = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4);
        let all_cores: Vec<usize> = (0..total).collect();
        (all_cores.clone(), Vec::new(), 2400000)
    };

    let total_cores = if !parsed_cores.is_empty() {
        parsed_cores.len()
    } else {
        big.len() + little.len()
    };

    let optimal_threads = if !big.is_empty() {
        big.len().clamp(2, 6)
    } else {
        total_cores.clamp(2, 4)
    };

    let (gpu_device, gpu_vendor) = detect_gpu_acceleration();

    HardwareTopology {
        total_cores,
        big_cores: big,
        little_cores: little,
        peak_frequency_khz: peak,
        optimal_thread_count: optimal_threads,
        gpu_device,
        gpu_vendor,
    }
}

/// Binds the calling thread to performance/big cores using `sched_setaffinity`.
pub fn bind_thread_to_big_cores(big_cores: &[usize]) -> Result<(), String> {
    if big_cores.is_empty() {
        return Ok(());
    }

    #[cfg(all(target_family = "unix", not(target_arch = "wasm32")))]
    {
        #[cfg(any(target_os = "linux", target_os = "android"))]
        unsafe {
            let mut cpuset: libc::cpu_set_t = std::mem::zeroed();
            libc::CPU_ZERO(&mut cpuset);
            for &core in big_cores {
                #[allow(clippy::unnecessary_cast)]
                if core < libc::CPU_SETSIZE as usize {
                    libc::CPU_SET(core, &mut cpuset);
                }
            }
            let res = libc::sched_setaffinity(0, std::mem::size_of::<libc::cpu_set_t>(), &cpuset);
            if res != 0 {
                return Err(format!("sched_setaffinity failed with code: {}", res));
            }
            return Ok(());
        }
    }

    #[allow(unreachable_code)]
    Ok(())
}

fn read_gguf_string(cursor: &mut Cursor<&[u8]>) -> Result<String, String> {
    let len = cursor.read_u64::<LittleEndian>().map_err(|e| e.to_string())? as usize;
    let pos = cursor.position() as usize;
    let data = cursor.get_ref();
    if pos + len > data.len() {
        return Err("Unexpected EOF while reading string".to_string());
    }
    let s = std::str::from_utf8(&data[pos..pos + len]).map_err(|e| e.to_string())?;
    cursor.set_position((pos + len) as u64);
    Ok(s.to_string())
}

fn skip_gguf_value(cursor: &mut Cursor<&[u8]>, vtype: u32) -> Result<(), String> {
    match vtype {
        0 | 1 | 7 => { // uint8, int8, bool
            cursor.set_position(cursor.position() + 1);
        }
        2 | 3 => { // uint16, int16
            cursor.set_position(cursor.position() + 2);
        }
        4..=6 => { // uint32, int32, float32
            cursor.set_position(cursor.position() + 4);
        }
        8 => { // string
            let len = cursor.read_u64::<LittleEndian>().map_err(|e| e.to_string())?;
            cursor.set_position(cursor.position() + len);
        }
        9 => { // array
            let elem_type = cursor.read_u32::<LittleEndian>().map_err(|e| e.to_string())?;
            let count = cursor.read_u64::<LittleEndian>().map_err(|e| e.to_string())?;
            for _ in 0..count.min(1000) {
                skip_gguf_value(cursor, elem_type)?;
            }
        }
        10..=12 => { // uint64, int64, float64
            cursor.set_position(cursor.position() + 8);
        }
        _ => return Err(format!("Unknown GGUF value type: {}", vtype)),
    }
    Ok(())
}

/// Parses GGUF header from in-memory byte slice in < 1ms without loading tensor weights.
pub fn inspect_gguf_bytes(data: &[u8]) -> Result<GgufHeaderInfo, String> {
    if data.len() < 24 {
        return Err("File too small to be a valid GGUF file".to_string());
    }

    if &data[0..4] != b"GGUF" {
        return Err("Invalid GGUF magic bytes".to_string());
    }

    let mut cursor = Cursor::new(data);
    cursor.set_position(4);

    let version = cursor.read_u32::<LittleEndian>().map_err(|e| e.to_string())?;
    let tensor_count = cursor.read_u64::<LittleEndian>().map_err(|e| e.to_string())?;
    let metadata_kv_count = cursor.read_u64::<LittleEndian>().map_err(|e| e.to_string())?;

    let mut architecture: Option<String> = None;
    let mut context_length: Option<u64> = None;

    let max_kvs = metadata_kv_count.min(100);
    for _ in 0..max_kvs {
        if cursor.position() as usize >= data.len() {
            break;
        }

        let key = match read_gguf_string(&mut cursor) {
            Ok(k) => k,
            Err(_) => break,
        };

        let val_type = match cursor.read_u32::<LittleEndian>() {
            Ok(t) => t,
            Err(_) => break,
        };

        if key == "general.architecture" && val_type == 8 {
            if let Ok(arch) = read_gguf_string(&mut cursor) {
                architecture = Some(arch);
            }
        } else if key.ends_with(".context_length") {
            if val_type == 4 { // uint32
                if let Ok(v) = cursor.read_u32::<LittleEndian>() {
                    context_length = Some(v as u64);
                }
            } else if val_type == 10 { // uint64
                if let Ok(v) = cursor.read_u64::<LittleEndian>() {
                    context_length = Some(v);
                }
            } else {
                let _ = skip_gguf_value(&mut cursor, val_type);
            }
        } else {
            let _ = skip_gguf_value(&mut cursor, val_type);
        }
    }

    Ok(GgufHeaderInfo {
        magic: "GGUF".to_string(),
        version,
        tensor_count,
        metadata_kv_count,
        architecture,
        context_length,
    })
}

/// Memory-mapped fast GGUF header inspection from file path.
pub fn inspect_gguf_header<P: AsRef<Path>>(path: P) -> Result<GgufHeaderInfo, String> {
    let p = path.as_ref();
    if !p.exists() {
        return Err(format!("File does not exist: {}", p.display()));
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let file = fs::File::open(p).map_err(|e| e.to_string())?;
        let file_len = file.metadata().map_err(|e| e.to_string())?.len() as usize;
        let map_len = file_len.min(64 * 1024);
        if map_len < 24 {
            return Err("File too small for GGUF header".to_string());
        }

        let mmap = unsafe {
            memmap2::MmapOptions::new()
                .len(map_len)
                .map(&file)
                .map_err(|e| e.to_string())?
        };

        inspect_gguf_bytes(&mmap)
    }

    #[cfg(target_arch = "wasm32")]
    {
        Err("Mmap GGUF inspection not supported on wasm32".to_string())
    }
}
