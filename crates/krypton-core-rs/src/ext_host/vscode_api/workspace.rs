use serde_json::Value;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone)]
pub struct WorkspaceHost {
    config: Arc<Mutex<Value>>,
}

impl Default for WorkspaceHost {
    fn default() -> Self {
        Self::new()
    }
}

impl WorkspaceHost {
    pub fn new() -> Self {
        Self {
            config: Arc::new(Mutex::new(Value::Object(serde_json::Map::new()))),
        }
    }

    pub fn get_configuration(&self, section: &str) -> Value {
        let lock = match self.config.lock() {
            Ok(guard) => guard,
            Err(_) => return Value::Null,
        };

        if section.is_empty() {
            return lock.clone();
        }

        let parts: Vec<&str> = section.split('.').filter(|s| !s.is_empty()).collect();
        let mut curr = &*lock;

        for part in parts {
            match curr {
                Value::Object(map) => {
                    if let Some(next) = map.get(part) {
                        curr = next;
                    } else {
                        return Value::Null;
                    }
                }
                _ => return Value::Null,
            }
        }

        curr.clone()
    }

    pub fn set_configuration(&self, section: &str, value: Value) {
        if let Ok(mut lock) = self.config.lock() {
            if section.is_empty() {
                *lock = value;
                return;
            }

            if !lock.is_object() {
                *lock = Value::Object(serde_json::Map::new());
            }

            let parts: Vec<&str> = section.split('.').filter(|s| !s.is_empty()).collect();
            if parts.is_empty() {
                return;
            }

            let mut curr = lock.as_object_mut().unwrap();
            for (idx, part) in parts.iter().enumerate() {
                if idx == parts.len() - 1 {
                    curr.insert(part.to_string(), value);
                    return;
                } else {
                    if !curr.contains_key(*part) || !curr[*part].is_object() {
                        curr.insert(part.to_string(), Value::Object(serde_json::Map::new()));
                    }
                    curr = curr.get_mut(*part).unwrap().as_object_mut().unwrap();
                }
            }
        }
    }
}
