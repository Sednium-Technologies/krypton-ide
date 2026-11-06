use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NotificationMessage {
    pub level: String,
    pub message: String,
    pub items: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub struct WindowHost {
    notifications: Arc<Mutex<Vec<NotificationMessage>>>,
}

impl WindowHost {
    pub fn new() -> Self {
        Self {
            notifications: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn push_notification(&self, note: NotificationMessage) {
        if let Ok(mut lock) = self.notifications.lock() {
            lock.push(note);
        }
    }

    pub fn drain_notifications(&self) -> Vec<NotificationMessage> {
        self.notifications
            .lock()
            .map(|mut l| std::mem::take(&mut *l))
            .unwrap_or_default()
    }
}
