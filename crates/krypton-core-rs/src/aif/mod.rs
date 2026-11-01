use byteorder::{BigEndian, ReadBytesExt, WriteBytesExt};
use serde::{Deserialize, Serialize};
use std::io::{Cursor, Read};

pub const AIF_MAGIC: [u8; 4] = [0x41, 0x49, 0x46, 0x34]; // 'AIF4'
pub const AIF_VERSION: u16 = 5;

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub enum OrbitalRing {
    RedCore,       // INT16_CORE: 0.70 - 1.00 (architecture, breaking changes, paused state)
    BlackMiddleRing, // INT8_RING: 0.30 - 0.69 (implementation notes, bug fixes)
    BlueOuterCrust,  // INT2_CRUST: 0.00 - 0.29 (transient summaries, logs)
}

impl OrbitalRing {
    pub fn from_importance(importance: f32) -> Self {
        if importance >= 0.70 {
            OrbitalRing::RedCore
        } else if importance >= 0.30 {
            OrbitalRing::BlackMiddleRing
        } else {
            OrbitalRing::BlueOuterCrust
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct CognitiveBlock {
    pub id: u64,
    pub importance: f32,
    pub created_at: i64,
    pub ring: OrbitalRing,
    pub summary: String,
    pub text: String,
    pub tags: Vec<String>,
    #[serde(default)]
    pub embedding: Option<Vec<f32>>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct AifDocument {
    pub project_name: String,
    pub blocks: Vec<CognitiveBlock>,
}

pub struct AifEngine;

impl AifEngine {
    /// Serializes an AIF document into a compact binary format.
    pub fn serialize_binary(doc: &AifDocument) -> Result<Vec<u8>, String> {
        let mut w = Vec::new();

        // 1. Magic + Version
        w.extend_from_slice(&AIF_MAGIC);
        w.write_u16::<BigEndian>(AIF_VERSION).unwrap();

        // 2. Project Name
        let name_bytes = doc.project_name.as_bytes();
        w.write_u16::<BigEndian>(name_bytes.len() as u16).unwrap();
        w.extend_from_slice(name_bytes);

        // 3. Blocks Count
        w.write_u32::<BigEndian>(doc.blocks.len() as u32).unwrap();

        // 4. Blocks
        for block in &doc.blocks {
            w.write_u64::<BigEndian>(block.id).unwrap();
            w.write_f32::<BigEndian>(block.importance).unwrap();
            w.write_i64::<BigEndian>(block.created_at).unwrap();

            let ring_byte: u8 = match block.ring {
                OrbitalRing::RedCore => 1,
                OrbitalRing::BlackMiddleRing => 2,
                OrbitalRing::BlueOuterCrust => 3,
            };
            w.write_u8(ring_byte).unwrap();

            let summary_bytes = block.summary.as_bytes();
            w.write_u32::<BigEndian>(summary_bytes.len() as u32).unwrap();
            w.extend_from_slice(summary_bytes);

            let text_bytes = block.text.as_bytes();
            w.write_u32::<BigEndian>(text_bytes.len() as u32).unwrap();
            w.extend_from_slice(text_bytes);

            w.write_u16::<BigEndian>(block.tags.len() as u16).unwrap();
            for tag in &block.tags {
                let tag_bytes = tag.as_bytes();
                w.write_u16::<BigEndian>(tag_bytes.len() as u16).unwrap();
                w.extend_from_slice(tag_bytes);
            }

            // Embedding vector (v5 extension)
            if let Some(ref emb) = block.embedding {
                w.write_u16::<BigEndian>(emb.len() as u16).unwrap();
                for &val in emb {
                    w.write_f32::<BigEndian>(val).unwrap();
                }
            } else {
                w.write_u16::<BigEndian>(0).unwrap();
            }
        }

        Ok(w)
    }

    /// Deserializes binary AIF format back into structured CognitiveBlocks.
    pub fn deserialize_binary(data: &[u8]) -> Result<AifDocument, String> {
        if data.len() < 8 {
            return Err("Binary buffer too small for AIF header".to_string());
        }

        let mut r = Cursor::new(data);
        let mut magic = [0u8; 4];
        r.read_exact(&mut magic).map_err(|e| e.to_string())?;
        if magic != AIF_MAGIC {
            return Err("Invalid AIF magic header".to_string());
        }

        let version = r.read_u16::<BigEndian>().map_err(|e| e.to_string())?;
        if version > AIF_VERSION {
            return Err(format!("Unsupported AIF version {version}"));
        }

        let name_len = r.read_u16::<BigEndian>().map_err(|e| e.to_string())? as usize;
        let mut name_bytes = vec![0u8; name_len];
        r.read_exact(&mut name_bytes).map_err(|e| e.to_string())?;
        let project_name = String::from_utf8_lossy(&name_bytes).to_string();

        let block_count = r.read_u32::<BigEndian>().map_err(|e| e.to_string())? as usize;
        let mut blocks = Vec::with_capacity(block_count);

        for _ in 0..block_count {
            let id = r.read_u64::<BigEndian>().map_err(|e| e.to_string())?;
            let importance = r.read_f32::<BigEndian>().map_err(|e| e.to_string())?;
            let created_at = r.read_i64::<BigEndian>().map_err(|e| e.to_string())?;

            let ring_byte = r.read_u8().map_err(|e| e.to_string())?;
            let ring = match ring_byte {
                1 => OrbitalRing::RedCore,
                2 => OrbitalRing::BlackMiddleRing,
                _ => OrbitalRing::BlueOuterCrust,
            };

            let sum_len = r.read_u32::<BigEndian>().map_err(|e| e.to_string())? as usize;
            let mut sum_bytes = vec![0u8; sum_len];
            r.read_exact(&mut sum_bytes).map_err(|e| e.to_string())?;
            let summary = String::from_utf8_lossy(&sum_bytes).to_string();

            let text_len = r.read_u32::<BigEndian>().map_err(|e| e.to_string())? as usize;
            let mut text_bytes = vec![0u8; text_len];
            r.read_exact(&mut text_bytes).map_err(|e| e.to_string())?;
            let text = String::from_utf8_lossy(&text_bytes).to_string();

            let tag_count = r.read_u16::<BigEndian>().map_err(|e| e.to_string())? as usize;
            let mut tags = Vec::with_capacity(tag_count);
            for _ in 0..tag_count {
                let tag_len = r.read_u16::<BigEndian>().map_err(|e| e.to_string())? as usize;
                let mut tag_bytes = vec![0u8; tag_len];
                r.read_exact(&mut tag_bytes).map_err(|e| e.to_string())?;
                tags.push(String::from_utf8_lossy(&tag_bytes).to_string());
            }

            // Read embedding if version >= 5 and bytes remain
            let embedding = if version >= 5 {
                let emb_len = r.read_u16::<BigEndian>().map_err(|e| e.to_string())? as usize;
                if emb_len > 0 {
                    let mut emb = Vec::with_capacity(emb_len);
                    for _ in 0..emb_len {
                        emb.push(r.read_f32::<BigEndian>().map_err(|e| e.to_string())?);
                    }
                    Some(emb)
                } else {
                    None
                }
            } else {
                None
            };

            blocks.push(CognitiveBlock {
                id,
                importance,
                created_at,
                ring,
                summary,
                text,
                tags,
                embedding,
            });
        }

        Ok(AifDocument {
            project_name,
            blocks,
        })
    }

    /// High-performance cognitive token pruner.
    ///
    /// Packs blocks into a strict token budget:
    /// - 100% of Red Core blocks are preserved in full text.
    /// - Black Middle Ring blocks are preserved in full if budget permits, or compressed to their summary.
    /// - Blue Outer Crust blocks are included only as short summaries if spare budget remains.
    pub fn prune_to_token_budget(doc: &AifDocument, max_estimated_tokens: usize) -> Vec<CognitiveBlock> {
        let mut pruned = Vec::new();
        let mut used_tokens = 0;

        // Roughly 1 token ≈ 4 characters of English/code
        let est_tokens = |s: &str| -> usize { s.len().div_ceil(4) };

        // 1. Mandatory pass: Red Core
        for b in &doc.blocks {
            if b.ring == OrbitalRing::RedCore {
                let cost = est_tokens(&b.text) + est_tokens(&b.summary);
                used_tokens += cost;
                pruned.push(b.clone());
            }
        }

        // If Red Core already exceeded budget, return it (Red Core is invariant)
        if used_tokens >= max_estimated_tokens {
            return pruned;
        }

        // 2. Black Ring pass (sorted by importance descending)
        let mut black_blocks: Vec<&CognitiveBlock> = doc
            .blocks
            .iter()
            .filter(|b| b.ring == OrbitalRing::BlackMiddleRing)
            .collect();
        black_blocks.sort_by(|a, b| b.importance.partial_cmp(&a.importance).unwrap_or(std::cmp::Ordering::Equal));

        for b in black_blocks {
            let full_cost = est_tokens(&b.text) + est_tokens(&b.summary);
            let sum_cost = est_tokens(&b.summary);

            if used_tokens + full_cost <= max_estimated_tokens {
                used_tokens += full_cost;
                pruned.push(b.clone());
            } else if used_tokens + sum_cost <= max_estimated_tokens {
                // Compress to summary only
                used_tokens += sum_cost;
                let mut compressed = b.clone();
                compressed.text = String::new();
                pruned.push(compressed);
            }
        }

        // 3. Blue Ring pass (summary only if budget still remains)
        for b in &doc.blocks {
            if b.ring == OrbitalRing::BlueOuterCrust {
                let sum_cost = est_tokens(&b.summary);
                if used_tokens + sum_cost <= max_estimated_tokens {
                    used_tokens += sum_cost;
                    let mut compressed = b.clone();
                    compressed.text = String::new();
                    pruned.push(compressed);
                }
            }
        }

        pruned
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_aif_binary_roundtrip_and_pruner() {
        let doc = AifDocument {
            project_name: "kryptonide".to_string(),
            blocks: vec![
                CognitiveBlock {
                    id: 1,
                    importance: 0.95,
                    created_at: 1700000000,
                    ring: OrbitalRing::RedCore,
                    summary: "Architecture spec".to_string(),
                    text: "Pure Rust core architecture with dual FFI targets".to_string(),
                    tags: vec!["core".to_string(), "rust".to_string()],
                    embedding: None,
                },
                CognitiveBlock {
                    id: 2,
                    importance: 0.50,
                    created_at: 1700000100,
                    ring: OrbitalRing::BlackMiddleRing,
                    summary: "Bugfix in search".to_string(),
                    text: "Detailed stacktrace of regex indexing issue...".to_string(),
                    tags: vec!["bugfix".to_string()],
                    embedding: None,
                },
            ],
        };

        let binary = AifEngine::serialize_binary(&doc).unwrap();
        assert_eq!(&binary[0..4], &AIF_MAGIC);

        let roundtrip = AifEngine::deserialize_binary(&binary).unwrap();
        assert_eq!(roundtrip.project_name, "kryptonide");
        assert_eq!(roundtrip.blocks.len(), 2);
        assert_eq!(roundtrip.blocks[0].ring, OrbitalRing::RedCore);

        // Prune test with small budget
        let pruned = AifEngine::prune_to_token_budget(&roundtrip, 20);
        assert!(!pruned.is_empty());
        assert_eq!(pruned[0].ring, OrbitalRing::RedCore);
    }

    #[test]
    fn test_aif_vector_embedding_roundtrip() {
        let dummy_vector = vec![0.123f32, -0.456, 0.789, 0.001];
        let doc = AifDocument {
            project_name: "vector_project".to_string(),
            blocks: vec![CognitiveBlock {
                id: 42,
                importance: 0.90,
                created_at: 1700000000,
                ring: OrbitalRing::RedCore,
                summary: "Vector block".to_string(),
                text: "EmbeddingGemma 2 768-d representation".to_string(),
                tags: vec!["vector".to_string(), "embeddinggemma-2".to_string()],
                embedding: Some(dummy_vector.clone()),
            }],
        };

        let binary = AifEngine::serialize_binary(&doc).unwrap();
        let decoded = AifEngine::deserialize_binary(&binary).unwrap();

        assert_eq!(decoded.blocks.len(), 1);
        assert_eq!(decoded.blocks[0].embedding, Some(dummy_vector));
    }
}
