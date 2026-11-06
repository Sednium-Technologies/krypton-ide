import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeExtensionHost } from '../src/lib/extensions/nativeExtensionHost';
import { useExtensionHostStore } from '../src/store/useExtensionHostStore';

test('NativeExtensionHost web fallback installVsix and listInstalled', async () => {
  const result = await NativeExtensionHost.installVsix({ path: '/tmp/test-ext.vsix' });
  assert.equal(result.success, true);
  assert.equal(result.extension.id, 'web.test-ext');
  assert.equal(result.extension.manifest.name, 'test-ext');

  const list = await NativeExtensionHost.listInstalled();
  assert.equal(list.extensions.length >= 1, true);
  assert.equal(list.extensions.some((e) => e.id === 'web.test-ext'), true);

  const manifestRes = await NativeExtensionHost.getManifest({ id: 'web.test-ext' });
  assert.ok(manifestRes.manifest);
  assert.equal(manifestRes.manifest?.name, 'test-ext');

  const uninst = await NativeExtensionHost.uninstall({ id: 'web.test-ext' });
  assert.equal(uninst.success, true);

  const afterList = await NativeExtensionHost.listInstalled();
  assert.equal(afterList.extensions.some((e) => e.id === 'web.test-ext'), false);
});

test('useExtensionHostStore install and uninstall lifecycle', async () => {
  const store = useExtensionHostStore.getState();

  const ext = await store.installVsix('/tmp/sample-tool.vsix');
  assert.equal(ext.id, 'web.sample-tool');

  let state = useExtensionHostStore.getState();
  assert.ok(state.installedExtensions.some((e) => e.id === 'web.sample-tool'));

  const manifest = await store.getManifest('web.sample-tool');
  assert.ok(manifest);
  assert.equal(manifest?.name, 'sample-tool');

  const removed = await store.uninstall('web.sample-tool');
  assert.equal(removed, true);

  state = useExtensionHostStore.getState();
  assert.equal(state.installedExtensions.some((e) => e.id === 'web.sample-tool'), false);
});
