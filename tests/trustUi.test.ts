import test from 'node:test';
import assert from 'node:assert/strict';
import { useTrustStore } from '../src/store/useTrustStore';
import { ExtensionManifest } from '../src/lib/extensions/nativeExtensionHost';

test('WorkspaceTrustBanner state and actions', async () => {
  const store = useTrustStore.getState();
  await store.restrictCurrentWorkspace();
  store.showTrustBanner();

  let state = useTrustStore.getState();
  assert.equal(state.isTrustBannerVisible, true);
  assert.equal(state.trustState, 'restricted');

  // Dismissing banner
  store.dismissTrustBanner();
  state = useTrustStore.getState();
  assert.equal(state.isTrustBannerVisible, false);

  // Trusting workspace hides banner and changes state
  await store.trustCurrentWorkspace();
  state = useTrustStore.getState();
  assert.equal(state.trustState, 'trusted');
  assert.equal(state.isTrusted, true);
  assert.equal(state.isTrustBannerVisible, false);
});

test('ExtensionConsentModal lifecycle with confirmation', async () => {
  const store = useTrustStore.getState();
  await store.restrictCurrentWorkspace();

  const powerfulExt: ExtensionManifest = {
    name: 'debugger-node',
    publisher: 'ms-vscode',
    version: '1.0.0',
    contributes: {
      debuggers: [{ type: 'node', label: 'Node Debug' }],
    },
  };

  let actionTaken = '';
  const triggered = store.requestExtensionConsent(
    'ms-vscode.debugger-node',
    powerfulExt,
    () => { actionTaken = 'confirmed'; },
    () => { actionTaken = 'cancelled'; }
  );

  assert.equal(triggered, true);
  let pending = useTrustStore.getState().pendingConsentModal;
  assert.ok(pending);
  assert.equal(pending?.extensionId, 'ms-vscode.debugger-node');
  assert.equal(pending?.permissions.length, 1);
  assert.equal(pending?.permissions[0].capability, 'spawnProcess');

  // Confirm action
  pending?.onConfirm();
  assert.equal(actionTaken, 'confirmed');
  assert.equal(useTrustStore.getState().pendingConsentModal, null);
});

test('ExtensionConsentModal lifecycle with cancellation', async () => {
  const store = useTrustStore.getState();
  await store.restrictCurrentWorkspace();

  const powerfulExt: ExtensionManifest = {
    name: 'terminal-exec',
    publisher: 'test',
    version: '1.0.0',
    capabilities: {
      untrustedWorkspaces: { supported: false },
    },
  };

  let actionTaken = '';
  store.requestExtensionConsent(
    'test.terminal-exec',
    powerfulExt,
    () => { actionTaken = 'confirmed'; },
    () => { actionTaken = 'cancelled'; }
  );

  const pending = useTrustStore.getState().pendingConsentModal;
  assert.ok(pending);

  // Cancel action via closeConsentModal
  store.closeConsentModal();
  assert.equal(actionTaken, 'cancelled');
  assert.equal(useTrustStore.getState().pendingConsentModal, null);
});
