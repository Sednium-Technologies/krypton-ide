import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeExtensionHost } from '../src/lib/extensions/nativeExtensionHost';
import { useExtensionHostStore } from '../src/store/useExtensionHostStore';

test('ExtensionHost Phase 2: command execution, activation, and notification flow', async () => {
  const store = useExtensionHostStore.getState();

  // 1. Install an extension
  const ext = await store.installVsix('/tmp/hello-plugin.vsix');
  assert.equal(ext.id, 'web.hello-plugin');

  // 2. Activate extension
  const activated = await store.activateExtension('web.hello-plugin');
  assert.equal(activated, true);

  const state = useExtensionHostStore.getState();
  assert.equal(state.activeExtensions['web.hello-plugin'], 'active');

  // 3. List commands
  const cmds = await store.refreshCommands();
  assert.ok(cmds.includes('krypton.ping'));

  // 4. Execute command
  const res = await store.executeCommand('krypton.ping');
  assert.equal(res, 'pong');

  // 5. Uninstall cleans up active state
  await store.uninstall('web.hello-plugin');
  const afterState = useExtensionHostStore.getState();
  assert.equal(afterState.activeExtensions['web.hello-plugin'], undefined);
});
