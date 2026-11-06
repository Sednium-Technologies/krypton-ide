use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Default)]
pub struct CommandRegistry {
    registered: Arc<Mutex<Vec<String>>>,
}

impl CommandRegistry {
    pub fn new() -> Self {
        Self {
            registered: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn register(&self, id: &str) {
        if let Ok(mut lock) = self.registered.lock() {
            if !lock.iter().any(|cmd| cmd == id) {
                lock.push(id.to_string());
            }
        }
    }

    pub fn unregister(&self, id: &str) {
        if let Ok(mut lock) = self.registered.lock() {
            lock.retain(|cmd| cmd != id);
        }
    }

    pub fn list(&self) -> Vec<String> {
        self.registered
            .lock()
            .map(|l| l.clone())
            .unwrap_or_default()
    }

    pub fn has(&self, id: &str) -> bool {
        self.registered
            .lock()
            .map(|l| l.iter().any(|cmd| cmd == id))
            .unwrap_or(false)
    }
}
