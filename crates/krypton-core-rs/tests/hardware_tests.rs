use std::fs;
use krypton_core_rs::hardware_topology::{
    calculate_big_cores, parse_cpu_frequencies, inspect_gguf_bytes,
};

#[test]
fn test_big_core_classification_snapdragon_tri_cluster() {
    // Typical Snapdragon 8 Gen 2 / Gen 3 layout:
    // Core 0-1: 1800 MHz (A510 / Little)
    // Core 2-3: 1800 MHz (A510 / Little)
    // Core 4-5: 2800 MHz (A715 / Big)
    // Core 6:   2800 MHz (A715 / Big)
    // Core 7:   3200 MHz (Cortex-X3 / Prime)
    // Peak = 3200. 85% of 3200 = 2720 MHz.
    // So cores with freq >= 2720 MHz are big cores: 4, 5, 6, 7.
    let cores = vec![
        (0, 1800000),
        (1, 1800000),
        (2, 1800000),
        (3, 1800000),
        (4, 2800000),
        (5, 2800000),
        (6, 2800000),
        (7, 3200000),
    ];

    let (big, little, peak) = calculate_big_cores(&cores);
    assert_eq!(peak, 3200000);
    assert_eq!(big, vec![4, 5, 6, 7]);
    assert_eq!(little, vec![0, 1, 2, 3]);
}

#[test]
fn test_sysfs_parsing_mock_directory() {
    let temp_dir = std::env::temp_dir().join("krypton_sysfs_test");
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    // Create cpu0 and cpu1
    let cpu0 = temp_dir.join("cpu0/cpufreq");
    fs::create_dir_all(&cpu0).unwrap();
    fs::write(cpu0.join("cpuinfo_max_freq"), "2000000\n").unwrap();

    let cpu1 = temp_dir.join("cpu1/cpufreq");
    fs::create_dir_all(&cpu1).unwrap();
    fs::write(cpu1.join("cpuinfo_max_freq"), "3000000\n").unwrap();

    let parsed = parse_cpu_frequencies(&temp_dir);
    assert_eq!(parsed.len(), 2);
    assert_eq!(parsed[0], (0, 2000000));
    assert_eq!(parsed[1], (1, 3000000));

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_inspect_gguf_mock_header() {
    // Construct valid GGUF header bytes:
    // Magic: "GGUF" = [0x47, 0x47, 0x55, 0x46]
    // Version: 3 (u32 LE)
    // Tensor count: 128 (u64 LE)
    // Metadata KV count: 1 (u64 LE)
    // Key: "general.architecture" (u64 len = 20, followed by string)
    // Value Type: 8 (STRING)
    // Value: "laya" (u64 len = 4, followed by string)
    let mut bytes = Vec::new();
    bytes.extend_from_slice(b"GGUF");
    bytes.extend_from_slice(&3u32.to_le_bytes());
    bytes.extend_from_slice(&128u64.to_le_bytes());
    bytes.extend_from_slice(&1u64.to_le_bytes());

    let key = "general.architecture";
    bytes.extend_from_slice(&(key.len() as u64).to_le_bytes());
    bytes.extend_from_slice(key.as_bytes());
    bytes.extend_from_slice(&8u32.to_le_bytes()); // STRING type
    let val = "laya";
    bytes.extend_from_slice(&(val.len() as u64).to_le_bytes());
    bytes.extend_from_slice(val.as_bytes());

    let header = inspect_gguf_bytes(&bytes).expect("Failed to parse valid GGUF header");
    assert_eq!(header.magic, "GGUF");
    assert_eq!(header.version, 3);
    assert_eq!(header.tensor_count, 128);
    assert_eq!(header.metadata_kv_count, 1);
    assert_eq!(header.architecture.as_deref(), Some("laya"));
}

#[test]
fn test_detect_cpu_topology_live_system() {
    let topo = krypton_core_rs::hardware_topology::detect_cpu_topology();
    assert!(topo.total_cores > 0);
    assert!(topo.optimal_thread_count >= 1);
    assert!(!topo.gpu_vendor.is_empty());
}

