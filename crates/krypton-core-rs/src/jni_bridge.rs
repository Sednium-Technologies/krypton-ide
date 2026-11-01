#[cfg(not(target_arch = "wasm32"))]
pub mod jni_impl {
    use crate::aif::{AifDocument, AifEngine};
    use crate::cancel::{cancel_token, create_token, get_token, unregister_token};
    use crate::diff::DiffEngine;
    use crate::search::{SearchEngine, SearchOptions};
    use jni::objects::{JByteBuffer, JClass, JObject, JString};
    use jni::sys::{jboolean, jint, jlong, jobject, jstring};
    use jni::JNIEnv;
    use std::path::Path;

    const STATUS_OK: jint = 0;
    const STATUS_ERROR_PANIC: jint = -1;
    const STATUS_CANCELLED: jint = -2;
    const STATUS_INVALID_ARG: jint = -3;

    /// Registers a cancellation token and returns its unique token ID.
    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_core_KryptonCoreNative_nativeCreateCancelToken(
        _env: JNIEnv,
        _class: JClass,
    ) -> jlong {
        let token = create_token();
        token.id() as jlong
    }

    /// Signals an active cancellation token.
    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_core_KryptonCoreNative_nativeCancelOperation(
        _env: JNIEnv,
        _class: JClass,
        token_id: jlong,
    ) -> jboolean {
        if cancel_token(token_id as u64) {
            1
        } else {
            0
        }
    }

    /// Releases a registered cancellation token once an operation finishes.
    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_core_KryptonCoreNative_nativeUnregisterCancelToken(
        _env: JNIEnv,
        _class: JClass,
        token_id: jlong,
    ) {
        unregister_token(token_id as u64);
    }

    /// Fast, multi-threaded disk search traversing files directly in kernel space.
    ///
    /// Streaming matches are dispatched back into Kotlin via `callback.onBatchFound(jsonChunk)`
    /// or batched direct arrays to avoid loading giant JSON strings into memory.
    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_core_KryptonCoreNative_nativeSearchDisk(
        mut env: JNIEnv,
        _class: JClass,
        dir_path: JString,
        query: JString,
        is_regex: jboolean,
        match_case: jboolean,
        max_matches: jint,
        token_id: jlong,
        callback: JObject,
    ) -> jint {
        // SAFETY: std::panic::catch_unwind ensures Rust panics never cross the foreign ABI into the JVM
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let path_str: String = match env.get_string(&dir_path) {
                Ok(s) => s.into(),
                Err(_) => return STATUS_INVALID_ARG,
            };

            let query_str: String = match env.get_string(&query) {
                Ok(s) => s.into(),
                Err(_) => return STATUS_INVALID_ARG,
            };

            let options = SearchOptions {
                query: query_str,
                is_regex: is_regex != 0,
                match_case: match_case != 0,
                max_matches: max_matches as usize,
            };

            let cancel_token = get_token(token_id as u64);

            let mut batch = Vec::new();
            let mut status_code = STATUS_OK;

            let path_ref = Path::new(&path_str);
            let search_res = SearchEngine::search_disk_directory(
                path_ref,
                &options,
                cancel_token.as_ref(),
                |m| {
                    batch.push(m);
                    // Stream in batches of 50 to avoid high memory spikes
                    if batch.len() >= 50 {
                        if let Ok(json) = serde_json::to_string(&batch) {
                            if let Ok(jstr) = env.new_string(&json) {
                                let _ = env.call_method(
                                    &callback,
                                    "onBatchFound",
                                    "(Ljava/lang/String;)V",
                                    &[(&jstr).into()],
                                );
                            }
                        }
                        batch.clear();
                    }
                    true
                },
            );

            match search_res {
                Ok(stats) => {
                    // Flush remaining items
                    if !batch.is_empty() {
                        if let Ok(json) = serde_json::to_string(&batch) {
                            if let Ok(jstr) = env.new_string(&json) {
                                let _ = env.call_method(
                                    &callback,
                                    "onBatchFound",
                                    "(Ljava/lang/String;)V",
                                    &[(&jstr).into()],
                                );
                            }
                        }
                    }

                    if stats.was_cancelled {
                        status_code = STATUS_CANCELLED;
                    }
                }
                Err(_) => {
                    status_code = -4;
                }
            }

            status_code
        }));

        result.unwrap_or(STATUS_ERROR_PANIC)
    }

    /// Computes line and inline diffs returning structured JSON.
    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_core_KryptonCoreNative_nativeComputeDiff(
        mut env: JNIEnv,
        _class: JClass,
        old_text: JString,
        new_text: JString,
    ) -> jstring {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let old_str: String = env.get_string(&old_text).map(|s| s.into()).unwrap_or_default();
            let new_str: String = env.get_string(&new_text).map(|s| s.into()).unwrap_or_default();

            let diff = DiffEngine::compute_diff(&old_str, &new_str);
            let json = serde_json::to_string(&diff).unwrap_or_else(|_| "{}".to_string());
            env.new_string(&json).map(|s| s.as_raw()).unwrap_or(std::ptr::null_mut())
        }));

        result.unwrap_or(std::ptr::null_mut())
    }

    /// High performance direct memory buffer AIF token pruner.
    ///
    /// Reads binary AIF from a DirectByteBuffer, applies temporal decay + attention pruning,
    /// and writes the pruned binary back into a newly allocated DirectByteBuffer.
    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_core_KryptonCoreNative_nativeAifPrune(
        env: JNIEnv,
        _class: JClass,
        direct_buffer: JObject,
        max_tokens: jint,
    ) -> jobject {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let byte_buf = JByteBuffer::from(direct_buffer);
            // SAFETY: get_direct_buffer_address retrieves the raw pointer of a direct Java ByteBuffer
            let buf_ptr = match env.get_direct_buffer_address(&byte_buf) {
                Ok(p) => p,
                Err(_) => return std::ptr::null_mut(),
            };
            let buf_capacity = match env.get_direct_buffer_capacity(&byte_buf) {
                Ok(c) => c,
                Err(_) => return std::ptr::null_mut(),
            };

            // SAFETY: buf_ptr is verified non-null and slice length equals buf_capacity
            let slice = unsafe { std::slice::from_raw_parts(buf_ptr, buf_capacity) };

            let doc = match AifEngine::deserialize_binary(slice) {
                Ok(d) => d,
                Err(_) => return std::ptr::null_mut(),
            };

            let pruned_blocks = AifEngine::prune_to_token_budget(&doc, max_tokens as usize);
            let pruned_doc = AifDocument {
                project_name: doc.project_name,
                blocks: pruned_blocks,
            };

            let out_bytes = match AifEngine::serialize_binary(&pruned_doc) {
                Ok(b) => b,
                Err(_) => return std::ptr::null_mut(),
            };

            // Allocate a direct byte buffer and copy out
            // For safety and leak-prevention, return a standard byte array or direct buffer
            let jarr = match env.byte_array_from_slice(&out_bytes) {
                Ok(arr) => arr,
                Err(_) => return std::ptr::null_mut(),
            };

            jarr.as_raw()
        }));

        result.unwrap_or(std::ptr::null_mut())
    }
}
