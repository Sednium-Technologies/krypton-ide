#![cfg(not(target_arch = "wasm32"))]

use krypton_core_rs::ext_host::ExtensionRuntime;

#[test]
fn test_eval_basic_math_and_string() {
    let rt = ExtensionRuntime::new().expect("should create runtime");
    let result = rt.eval_string("1 + 2 * 3").expect("eval math should succeed");
    assert_eq!(result, "7");

    let str_result = rt.eval_string("'hello ' + 'krypton'").expect("eval string should succeed");
    assert_eq!(str_result, "hello krypton");
}

#[test]
fn test_eval_json_objects_and_arrays() {
    let rt = ExtensionRuntime::new().expect("should create runtime");
    let json_val = rt.eval_json("({ name: 'krypton', active: true, count: 42, tags: ['ide', 'rust'] })")
        .expect("eval json should succeed");

    assert_eq!(json_val["name"], "krypton");
    assert_eq!(json_val["active"], true);
    assert_eq!(json_val["count"], 42);
    assert_eq!(json_val["tags"][0], "ide");
    assert_eq!(json_val["tags"][1], "rust");
}

#[test]
fn test_eval_syntax_error() {
    let rt = ExtensionRuntime::new().expect("should create runtime");
    let err = rt.eval_string("const x = ;");
    assert!(err.is_err(), "Invalid syntax should return an error");
}

#[test]
fn test_console_log() {
    let rt = ExtensionRuntime::new().expect("should create runtime");
    rt.eval_string("console.log('Testing console integration'); console.warn('Warning test');")
        .expect("console methods should execute without error");

    let logs = rt.get_logs();
    assert!(logs.iter().any(|l| l.contains("Testing console integration")));
    assert!(logs.iter().any(|l| l.contains("Warning test")));
}

#[test]
fn test_microtask_promise() {
    let rt = ExtensionRuntime::new().expect("should create runtime");
    rt.eval_string(r#"
        globalThis.testVal = 0;
        Promise.resolve().then(() => {
            globalThis.testVal = 42;
        });
    "#).expect("promise registration should succeed");

    // After pumping microtasks, testVal must be 42
    let val = rt.eval_string("globalThis.testVal").expect("should read testVal");
    assert_eq!(val, "42");
}
