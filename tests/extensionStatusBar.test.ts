import test from 'node:test';
import assert from 'node:assert/strict';
import { useExtensionHostStore } from '../src/store/useExtensionHostStore';
import { setWebMockStatusBarItem, registerWebMockCommand } from '../src/lib/extensions/nativeExtensionHost';

test('Status bar items are listed and prioritized in useExtensionHostStore', async () => {
  setWebMockStatusBarItem({
    id: 'sb_sync',
    text: '$(sync) Synced',
    tooltip: 'Sync is healthy',
    command: 'git.sync',
    priority: 50,
    visible: true,
  });

  setWebMockStatusBarItem({
    id: 'sb_error',
    text: '$(alert) 1 Error',
    tooltip: 'Build error',
    priority: 100,
    visible: true,
  });

  const items = await useExtensionHostStore.getState().refreshStatusBarItems();
  assert.equal(items.length, 2);
  // Priority 100 should be first
  assert.equal(items[0].id, 'sb_error');
  assert.equal(items[1].id, 'sb_sync');
});

test('Clicking status bar item with command executes it through useExtensionHostStore', async () => {
  let executed = false;
  registerWebMockCommand('ext.statusAction', () => {
    executed = true;
    return 'ok';
  });

  setWebMockStatusBarItem({
    id: 'sb_action',
    text: 'Click Me',
    command: 'ext.statusAction',
    visible: true,
  });

  await useExtensionHostStore.getState().refreshStatusBarItems();
  const res = await useExtensionHostStore.getState().executeCommand('ext.statusAction');
  assert.equal(res, 'ok');
  assert.equal(executed, true);
});
