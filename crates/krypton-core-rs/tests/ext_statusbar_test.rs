use krypton_core_rs::ext_host::runtime::ExtensionRuntime;
use krypton_core_rs::ext_host::vscode_api::VscodeApiHost;

#[test]
fn test_status_bar_item_lifecycle() {
    let runtime = ExtensionRuntime::new().expect("Runtime creation");
    let api = VscodeApiHost::new();
    api.inject_into_runtime(&runtime, "/tmp")
        .expect("Injection");

    let script = r#"
        const vscode = require('vscode');
        const item = vscode.window.createStatusBarItem(1, 100);
        item.text = "$(sync) Syncing";
        item.tooltip = "Click to run sync";
        item.command = "ext.syncCommand";
        item.show();
    "#;

    runtime.eval_string(script).expect("Eval script");

    let items = api.list_status_bar_items();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].text, "$(sync) Syncing");
    assert_eq!(items[0].command.as_deref(), Some("ext.syncCommand"));
    assert_eq!(items[0].visible, true);

    // Hide item
    let hide_script = r#"
        item.hide();
    "#;
    runtime.eval_string(hide_script).expect("Hide script");
    let items_after_hide = api.list_status_bar_items();
    assert_eq!(items_after_hide.len(), 0);

    // Show again then dispose
    let dispose_script = r#"
        item.show();
        item.dispose();
    "#;
    runtime.eval_string(dispose_script).expect("Dispose script");
    let items_after_dispose = api.list_status_bar_items();
    assert_eq!(items_after_dispose.len(), 0);
}
