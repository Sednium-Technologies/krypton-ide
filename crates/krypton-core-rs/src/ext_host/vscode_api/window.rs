use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NotificationMessage {
    pub level: String,
    pub message: String,
    pub items: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusBarItemState {
    pub id: String,
    #[serde(default)]
    pub alignment: i32,
    #[serde(default)]
    pub priority: i32,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub tooltip: Option<String>,
    #[serde(default)]
    pub command: Option<String>,
    #[serde(default)]
    pub visible: bool,
}

#[derive(Debug, Clone, Default)]
pub struct WindowHost {
    notifications: Arc<Mutex<Vec<NotificationMessage>>>,
    status_bar_items: Arc<Mutex<HashMap<String, StatusBarItemState>>>,
}

impl WindowHost {
    pub fn new() -> Self {
        Self {
            notifications: Arc::new(Mutex::new(Vec::new())),
            status_bar_items: Arc::new(Mutex::new(HashMap::new())),
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

    pub fn update_status_bar_item(&self, item: StatusBarItemState) {
        if let Ok(mut lock) = self.status_bar_items.lock() {
            lock.insert(item.id.clone(), item);
        }
    }

    pub fn dispose_status_bar_item(&self, id: &str) {
        if let Ok(mut lock) = self.status_bar_items.lock() {
            lock.remove(id);
        }
    }

    pub fn list_status_bar_items(&self) -> Vec<StatusBarItemState> {
        if let Ok(lock) = self.status_bar_items.lock() {
            let mut items: Vec<StatusBarItemState> =
                lock.values().filter(|it| it.visible).cloned().collect();
            items.sort_by(|a, b| b.priority.cmp(&a.priority));
            items
        } else {
            Vec::new()
        }
    }
}
