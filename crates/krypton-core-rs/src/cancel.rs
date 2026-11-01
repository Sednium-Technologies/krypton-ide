use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

/// Thread-safe cooperative cancellation token.
#[derive(Clone, Debug)]
pub struct CancellationToken {
    id: u64,
    cancelled: Arc<AtomicBool>,
}

impl CancellationToken {
    pub fn new(id: u64) -> Self {
        Self {
            id,
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    #[inline]
    pub fn id(&self) -> u64 {
        self.id
    }

    #[inline]
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Relaxed)
    }

    #[inline]
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    #[inline]
    pub fn reset(&self) {
        self.cancelled.store(false, Ordering::SeqCst);
    }
}

static TOKEN_COUNTER: AtomicU64 = AtomicU64::new(1);
static REGISTRY: OnceLock<Mutex<HashMap<u64, CancellationToken>>> = OnceLock::new();

fn registry() -> &'static Mutex<HashMap<u64, CancellationToken>> {
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Creates and registers a new cancellation token, returning its handle ID.
pub fn create_token() -> CancellationToken {
    let id = TOKEN_COUNTER.fetch_add(1, Ordering::Relaxed);
    let token = CancellationToken::new(id);
    if let Ok(mut map) = registry().lock() {
        map.insert(id, token.clone());
    }
    token
}

/// Retrieves a registered cancellation token by its handle ID.
pub fn get_token(id: u64) -> Option<CancellationToken> {
    if let Ok(map) = registry().lock() {
        map.get(&id).cloned()
    } else {
        None
    }
}

/// Cancels an active token by ID. Returns true if the token existed and was cancelled.
pub fn cancel_token(id: u64) -> bool {
    if let Some(token) = get_token(id) {
        token.cancel();
        true
    } else {
        false
    }
}

/// Unregisters a token when an operation completes to prevent memory leaks.
pub fn unregister_token(id: u64) {
    if let Ok(mut map) = registry().lock() {
        map.remove(&id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cancellation_flow() {
        let token = create_token();
        let id = token.id();
        assert!(!token.is_cancelled());

        assert!(cancel_token(id));
        assert!(token.is_cancelled());

        unregister_token(id);
        assert!(get_token(id).is_none());
    }
}
