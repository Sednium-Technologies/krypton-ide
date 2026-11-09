use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

const MAX_WEBVIEW_HTML_BYTES: usize = 8 * 1024 * 1024;
const MAX_WEBVIEW_MESSAGE_BYTES: usize = 1024 * 1024;

static NEXT_WEBVIEW_ID: AtomicU64 = AtomicU64::new(1);

/// A serializable snapshot of a webview created by an extension at runtime.
///
/// Extensions build this HTML dynamically through `vscode.window.createWebviewPanel`
/// or `vscode.window.registerWebviewViewProvider`. The snapshot is polled by the
/// UI layer, which renders the HTML inside a sandboxed iframe and forwards
/// messages back through the extension host.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WebviewSnapshot {
    pub id: String,
    pub extension_id: String,
    pub kind: String,
    pub view_type: String,
    pub title: String,
    pub html: String,
    pub visible: bool,
    #[serde(default)]
    pub messages: Vec<Value>,
}

#[derive(Debug, Clone)]
struct WebviewEntry {
    id: String,
    extension_id: String,
    kind: String,
    view_type: String,
    title: String,
    html: String,
    visible: bool,
    messages: Vec<Value>,
    disposed: bool,
}

impl WebviewEntry {
    fn snapshot(&self, messages: Vec<Value>) -> WebviewSnapshot {
        WebviewSnapshot {
            id: self.id.clone(),
            extension_id: self.extension_id.clone(),
            kind: self.kind.clone(),
            view_type: self.view_type.clone(),
            title: self.title.clone(),
            html: self.html.clone(),
            visible: self.visible,
            messages,
        }
    }
}

/// Tracks live webviews for every active extension runtime.
#[derive(Debug, Clone, Default)]
pub struct WebviewHost {
    entries: Arc<Mutex<HashMap<String, WebviewEntry>>>,
}

impl WebviewHost {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&self, extension_id: &str, kind: &str, view_type: &str, title: &str) -> String {
        let id = format!(
            "wv_{}",
            NEXT_WEBVIEW_ID.fetch_add(1, Ordering::Relaxed)
        );
        let entry = WebviewEntry {
            id: id.clone(),
            extension_id: extension_id.to_string(),
            kind: kind.to_string(),
            view_type: view_type.to_string(),
            title: title.to_string(),
            html: String::new(),
            visible: true,
            messages: Vec::new(),
            disposed: false,
        };
        if let Ok(mut lock) = self.entries.lock() {
            lock.insert(id.clone(), entry);
        }
        id
    }

    pub fn set_html(&self, id: &str, html: &str) {
        if html.len() > MAX_WEBVIEW_HTML_BYTES {
            return;
        }
        if let Ok(mut lock) = self.entries.lock() {
            if let Some(entry) = lock.get_mut(id) {
                entry.html = html.to_string();
            }
        }
    }

    pub fn set_title(&self, id: &str, title: &str) {
        if let Ok(mut lock) = self.entries.lock() {
            if let Some(entry) = lock.get_mut(id) {
                entry.title = title.to_string();
            }
        }
    }

    pub fn set_visible(&self, id: &str, visible: bool) {
        if let Ok(mut lock) = self.entries.lock() {
            if let Some(entry) = lock.get_mut(id) {
                entry.visible = visible;
            }
        }
    }

    pub fn post_message(&self, id: &str, message: Value) -> bool {
        if serde_json::to_string(&message)
            .map(|json| json.len() > MAX_WEBVIEW_MESSAGE_BYTES)
            .unwrap_or(true)
        {
            return false;
        }
        if let Ok(mut lock) = self.entries.lock() {
            if let Some(entry) = lock.get_mut(id) {
                entry.messages.push(message);
                return true;
            }
        }
        false
    }

    pub fn dispose(&self, id: &str) {
        if let Ok(mut lock) = self.entries.lock() {
            lock.remove(id);
        }
    }

    pub fn contains(&self, id: &str) -> bool {
        self.entries
            .lock()
            .map(|lock| lock.contains_key(id))
            .unwrap_or(false)
    }

    pub fn take_messages(&self, id: &str) -> Vec<Value> {
        self.entries
            .lock()
            .ok()
            .and_then(|mut lock| lock.get_mut(id).map(|entry| std::mem::take(&mut entry.messages)))
            .unwrap_or_default()
    }

    pub fn snapshot(&self, id: &str) -> Option<WebviewSnapshot> {
        let mut lock = self.entries.lock().ok()?;
        let entry = lock.get_mut(id)?;
        if entry.disposed {
            return None;
        }
        let messages = std::mem::take(&mut entry.messages);
        Some(entry.snapshot(messages))
    }

    pub fn snapshot_for(
        &self,
        extension_id: &str,
        view_type: &str,
    ) -> Option<WebviewSnapshot> {
        let mut lock = self.entries.lock().ok()?;
        let entry = lock
            .values_mut()
            .filter(|entry| {
                !entry.disposed
                    && entry.extension_id == extension_id
                    && entry.view_type == view_type
            })
            .max_by_key(|entry| entry.id.clone())?;
        let messages = std::mem::take(&mut entry.messages);
        Some(entry.snapshot(messages))
    }

    pub fn drain(&self, extension_id: &str) -> Vec<WebviewSnapshot> {
        let mut lock = match self.entries.lock() {
            Ok(lock) => lock,
            Err(_) => return Vec::new(),
        };
        let mut snapshots: Vec<WebviewSnapshot> = lock
            .values_mut()
            .filter(|entry| !entry.disposed && entry.extension_id == extension_id)
            .map(|entry| {
                let messages = std::mem::take(&mut entry.messages);
                entry.snapshot(messages)
            })
            .collect();
        snapshots.sort_by(|a, b| a.id.cmp(&b.id));
        snapshots
    }

    pub fn clear_extension(&self, extension_id: &str) {
        if let Ok(mut lock) = self.entries.lock() {
            lock.retain(|_, entry| entry.extension_id != extension_id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registers_updates_and_drains_webviews() {
        let host = WebviewHost::new();
        let id = host.register("publisher.ext", "view", "sample.view", "Sample");
        host.set_html(&id, "<html><body>Hello</body></html>");
        host.post_message(&id, serde_json::json!({ "type": "ready" }));

        let snapshot = host.snapshot(&id).expect("snapshot");
        assert_eq!(snapshot.extension_id, "publisher.ext");
        assert_eq!(snapshot.view_type, "sample.view");
        assert!(snapshot.html.contains("Hello"));
        assert_eq!(snapshot.messages.len(), 1);

        assert!(host.snapshot(&id).expect("second snapshot").messages.is_empty());
        host.dispose(&id);
        assert!(!host.contains(&id));
    }
}
