import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeExtensionHost } from '../src/lib/extensions/nativeExtensionHost';
import { useExtensionHostStore } from '../src/store/useExtensionHostStore';

test('Phase 1 E2E: Native extension installation and store reconciliation', async () => {
  const store = useExtensionHostStore.getState();

  // Initially empty or clean
  await store.loadInstalled();

  // 1. Install extension via native host
  const ext = await store.installVsix('/data/user/0/com.sednium.kryptonide/files/sample-tooling.vsix');
  assert.equal(ext.id, 'web.sample-tooling');
  assert.equal(ext.version, '1.0.0');
  assert.ok(ext.location);

  // 2. Query manifest
  const manifest = await store.getManifest(ext.id);
  assert.ok(manifest);
  assert.equal(manifest?.name, 'sample-tooling');
  assert.equal(manifest?.publisher, 'web');

  // 3. Store reflects installed extensions
  const currentList = useExtensionHostStore.getState().installedExtensions;
  assert.equal(currentList.some((e) => e.id === 'web.sample-tooling'), true);

  // 4. Uninstall extension
  const removed = await store.uninstall('web.sample-tooling');
  assert.equal(removed, true);

  // 5. Manifest after uninstall is null
  const manifestAfter = await store.getManifest('web.sample-tooling');
  assert.equal(manifestAfter, null);

  // 6. Store reflects removal
  const afterList = useExtensionHostStore.getState().installedExtensions;
  assert.equal(afterList.some((e) => e.id === 'web.sample-tooling'), false);
});

test('Phase 1 E2E: Nonexistent extension uninstall returns false', async () => {
  const store = useExtensionHostStore.getState();
  const res = await store.uninstall('nonexistent.fake-ext');
  assert.equal(res, false);
});
