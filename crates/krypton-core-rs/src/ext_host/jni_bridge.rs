#[cfg(not(target_arch = "wasm32"))]
pub mod ext_jni_impl {
    use crate::ext_host::{get_installed_manifest, install_vsix, list_installed, uninstall_extension};
    use jni::objects::{JClass, JString};
    use jni::sys::{jboolean, jstring};
    use jni::JNIEnv;
    use serde::Serialize;
    use std::path::Path;

    fn to_json_jstring<T: Serialize>(env: &mut JNIEnv, result: Result<T, String>) -> jstring {
        let json = match result {
            Ok(data) => serde_json::to_string(&serde_json::json!({
                "success": true,
                "data": data,
            })),
            Err(err) => serde_json::to_string(&serde_json::json!({
                "success": false,
                "error": err,
            })),
        }
        .unwrap_or_else(|_| r#"{"success":false,"error":"Serialization failed"}"#.to_string());

        env.new_string(&json)
            .map(|s| s.as_raw())
            .unwrap_or(std::ptr::null_mut())
    }

    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_extensions_ExtensionHostNative_nativeInstallVsix(
        mut env: JNIEnv,
        _class: JClass,
        vsix_path: JString,
        extensions_dir: JString,
    ) -> jstring {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let vsix_str: String = match env.get_string(&vsix_path) {
                Ok(s) => s.into(),
                Err(e) => return to_json_jstring::<()>(
                    &mut env,
                    Err(format!("Invalid vsix_path JString: {}", e)),
                ),
            };

            let dir_str: String = match env.get_string(&extensions_dir) {
                Ok(s) => s.into(),
                Err(e) => return to_json_jstring::<()>(
                    &mut env,
                    Err(format!("Invalid extensions_dir JString: {}", e)),
                ),
            };

            let res = install_vsix(Path::new(&vsix_str), Path::new(&dir_str));
            to_json_jstring(&mut env, res)
        }));

        result.unwrap_or(std::ptr::null_mut())
    }

    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_extensions_ExtensionHostNative_nativeListInstalled(
        mut env: JNIEnv,
        _class: JClass,
        extensions_dir: JString,
    ) -> jstring {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let dir_str: String = match env.get_string(&extensions_dir) {
                Ok(s) => s.into(),
                Err(e) => return to_json_jstring::<()>(
                    &mut env,
                    Err(format!("Invalid extensions_dir JString: {}", e)),
                ),
            };

            let res = list_installed(Path::new(&dir_str));
            to_json_jstring(&mut env, res)
        }));

        result.unwrap_or(std::ptr::null_mut())
    }

    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_extensions_ExtensionHostNative_nativeUninstall(
        mut env: JNIEnv,
        _class: JClass,
        extension_id: JString,
        extensions_dir: JString,
    ) -> jboolean {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let id_str: String = match env.get_string(&extension_id) {
                Ok(s) => s.into(),
                Err(_) => return 0,
            };

            let dir_str: String = match env.get_string(&extensions_dir) {
                Ok(s) => s.into(),
                Err(_) => return 0,
            };

            match uninstall_extension(&id_str, Path::new(&dir_str)) {
                Ok(true) => 1,
                _ => 0,
            }
        }));

        result.unwrap_or(0)
    }

    #[no_mangle]
    pub extern "system" fn Java_com_sednium_kryptonide_extensions_ExtensionHostNative_nativeGetManifest(
        mut env: JNIEnv,
        _class: JClass,
        extension_id: JString,
        extensions_dir: JString,
    ) -> jstring {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let id_str: String = match env.get_string(&extension_id) {
                Ok(s) => s.into(),
                Err(e) => return to_json_jstring::<()>(
                    &mut env,
                    Err(format!("Invalid extension_id JString: {}", e)),
                ),
            };

            let dir_str: String = match env.get_string(&extensions_dir) {
                Ok(s) => s.into(),
                Err(e) => return to_json_jstring::<()>(
                    &mut env,
                    Err(format!("Invalid extensions_dir JString: {}", e)),
                ),
            };

            let res = get_installed_manifest(&id_str, Path::new(&dir_str));
            to_json_jstring(&mut env, res)
        }));

        result.unwrap_or(std::ptr::null_mut())
    }
}
