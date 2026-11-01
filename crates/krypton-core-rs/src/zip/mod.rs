use byteorder::{LittleEndian, WriteBytesExt};
use flate2::read::DeflateDecoder;
use flate2::write::DeflateEncoder;
use flate2::Compression;
use std::io::{Read, Write};

#[derive(Debug, Clone)]
pub struct ZipEntry {
    pub name: String,
    pub data: Vec<u8>,
}

pub struct ZipEngine;

impl ZipEngine {
    /// Compresses a list of in-memory files into a valid ZIP archive byte buffer.
    ///
    /// Implements PKZip standard 2.0 format with DEFLATE compression.
    pub fn create_archive(entries: &[ZipEntry], level: u32) -> Result<Vec<u8>, String> {
        let mut out = Vec::new();
        let mut central_dir = Vec::new();

        let compression = match level {
            0 => Compression::none(),
            1..=3 => Compression::fast(),
            _ => Compression::default(),
        };

        for entry in entries {
            let local_header_offset = out.len() as u32;

            // Compute CRC-32
            let mut hasher = crc32fast::Hasher::new();
            hasher.update(&entry.data);
            let crc = hasher.finalize();

            // Compress payload
            let compressed_data = if level == 0 {
                entry.data.clone()
            } else {
                let mut encoder = DeflateEncoder::new(Vec::new(), compression);
                encoder
                    .write_all(&entry.data)
                    .map_err(|e| format!("Deflate encode error: {e}"))?;
                encoder
                    .finish()
                    .map_err(|e| format!("Deflate finish error: {e}"))?
            };

            let method: u16 = if level == 0 { 0 } else { 8 }; // 0 = stored, 8 = deflated
            let name_bytes = entry.name.as_bytes();
            let name_len = name_bytes.len() as u16;

            // Local file header (PK\x03\x04)
            out.write_u32::<LittleEndian>(0x04034b50).unwrap();
            out.write_u16::<LittleEndian>(20).unwrap(); // Version needed to extract
            out.write_u16::<LittleEndian>(0).unwrap();  // General purpose bit flag
            out.write_u16::<LittleEndian>(method).unwrap();
            out.write_u16::<LittleEndian>(0).unwrap();  // Last mod time
            out.write_u16::<LittleEndian>(0).unwrap();  // Last mod date
            out.write_u32::<LittleEndian>(crc).unwrap();
            out.write_u32::<LittleEndian>(compressed_data.len() as u32).unwrap();
            out.write_u32::<LittleEndian>(entry.data.len() as u32).unwrap();
            out.write_u16::<LittleEndian>(name_len).unwrap();
            out.write_u16::<LittleEndian>(0).unwrap();  // Extra field length
            out.extend_from_slice(name_bytes);
            out.extend_from_slice(&compressed_data);

            // Central directory entry (PK\x01\x02)
            central_dir.write_u32::<LittleEndian>(0x02014b50).unwrap();
            central_dir.write_u16::<LittleEndian>(20).unwrap(); // Version made by
            central_dir.write_u16::<LittleEndian>(20).unwrap(); // Version needed
            central_dir.write_u16::<LittleEndian>(0).unwrap();  // Flags
            central_dir.write_u16::<LittleEndian>(method).unwrap();
            central_dir.write_u16::<LittleEndian>(0).unwrap();  // Mod time
            central_dir.write_u16::<LittleEndian>(0).unwrap();  // Mod date
            central_dir.write_u32::<LittleEndian>(crc).unwrap();
            central_dir.write_u32::<LittleEndian>(compressed_data.len() as u32).unwrap();
            central_dir.write_u32::<LittleEndian>(entry.data.len() as u32).unwrap();
            central_dir.write_u16::<LittleEndian>(name_len).unwrap();
            central_dir.write_u16::<LittleEndian>(0).unwrap();  // Extra field length
            central_dir.write_u16::<LittleEndian>(0).unwrap();  // Comment length
            central_dir.write_u16::<LittleEndian>(0).unwrap();  // Disk number
            central_dir.write_u16::<LittleEndian>(0).unwrap();  // Internal file attributes
            central_dir.write_u32::<LittleEndian>(0).unwrap();  // External file attributes
            central_dir.write_u32::<LittleEndian>(local_header_offset).unwrap();
            central_dir.extend_from_slice(name_bytes);
        }

        let central_dir_offset = out.len() as u32;
        let central_dir_size = central_dir.len() as u32;
        out.extend_from_slice(&central_dir);

        // End of central directory record (PK\x05\x06)
        out.write_u32::<LittleEndian>(0x06054b50).unwrap();
        out.write_u16::<LittleEndian>(0).unwrap(); // Number of this disk
        out.write_u16::<LittleEndian>(0).unwrap(); // Disk where central directory starts
        out.write_u16::<LittleEndian>(entries.len() as u16).unwrap(); // Entries on this disk
        out.write_u16::<LittleEndian>(entries.len() as u16).unwrap(); // Total entries
        out.write_u32::<LittleEndian>(central_dir_size).unwrap();
        out.write_u32::<LittleEndian>(central_dir_offset).unwrap();
        out.write_u16::<LittleEndian>(0).unwrap(); // Comment length

        Ok(out)
    }

    /// Fast decompression of an entry payload from deflated bytes.
    pub fn decompress_deflate(data: &[u8]) -> Result<Vec<u8>, String> {
        let mut decoder = DeflateDecoder::new(data);
        let mut decompressed = Vec::new();
        decoder
            .read_to_end(&mut decompressed)
            .map_err(|e| format!("Decompress failed: {e}"))?;
        Ok(decompressed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_zip_create_archive() {
        let entries = vec![
            ZipEntry {
                name: "hello.txt".to_string(),
                data: b"Hello Kryptonide Rust Core!".to_vec(),
            },
            ZipEntry {
                name: "config.json".to_string(),
                data: b"{\"theme\": \"krypton-warm\"}".to_vec(),
            },
        ];

        let archive = ZipEngine::create_archive(&entries, 1).unwrap();
        assert!(archive.len() > 50);
        // Check magic PK\x03\x04
        assert_eq!(&archive[0..4], b"\x50\x4b\x03\x04");
    }
}
