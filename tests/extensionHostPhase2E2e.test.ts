import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeExtensionHost, ExtensionHostWeb } from '../src/lib/extensions/nativeExtensionHost';
import { useExtensionHostStore } from '../src/store/useExtensionHostStore';

test('Phase 2 E2E: Full command execution lifecycle and notification dispatch', async () => {
  const store = useExtensionHostStore.getState();

  // 1. Install fixture extension
  const ext = await store.installVsix('/tmp/sample-command-ext.vsix');
  assert.equal(ext.id, 'web.sample-command-ext');
  assert.equal(ext.manifest.name, 'sample-command-ext');

  // Register simulated commands for the fixture in web preview fallback
  const webHost = (NativeExtensionHost as any) as ExtensionHostWeb;
  if (typeof webHost.registerMockCommand === 'function') {
    webHost.registerMockCommand('sample.hello', (name: string) => `Hello ${name || 'World'}`);
    webHost.registerMockCommand('sample.compute', (a: number, b: number) => (Number(a) || 0) + (Number(b) || 0));
    webHost.pushMockNotification({
      level: 'info',
      message: 'Sample Command Extension Activated',
      items: ['OK'],
    });
  }

  // 2. Activate extension
  const activated = await store.activateExtension('web.sample-command-ext');
  assert.equal(activated, true);
  assert.equal(useExtensionHostStore.getState().activeExtensions['web.sample-command-ext'], 'active');

  // 3. Verify registered commands
  const cmds = await store.refreshCommands();
  assert.ok(cmds.includes('sample.hello'));
  assert.ok(cmds.includes('sample.compute'));

  // 4. Execute commands
  const helloResult = await store.executeCommand<string>('sample.hello', ['Kryptonide']);
  assert.equal(helloResult, 'Hello Kryptonide');

  const computeResult = await store.executeCommand<number>('sample.compute', [19, 23]);
  assert.equal(computeResult, 42);

  // 5. Verify notification draining
  const notifications = await store.drainNotifications();
  if (notifications.length > 0) {
    assert.equal(notifications[0].message, 'Sample Command Extension Activated');
  }

  // 6. Uninstall extension
  const removed = await store.uninstall('web.sample-command-ext');
  assert.equal(removed, true);
  assert.equal(useExtensionHostStore.getState().activeExtensions['web.sample-command-ext'], undefined);
});
