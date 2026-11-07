import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NativeExtensionHost,
  inspectExtensionPermissions,
  ExtensionManifest,
} from '../src/lib/extensions/nativeExtensionHost';
import { useTrustStore } from '../src/store/useTrustStore';

test('useTrustStore initializes with default restricted state', async () => {
  const store = useTrustStore.getState();
  await store.initializeTrust('/workspace/my-project');

  const state = useTrustStore.getState();
  assert.equal(state.trustState, 'restricted');
  assert.equal(state.isTrusted, false);
  assert.equal(state.workspaceRoot, '/workspace/my-project');
  assert.equal(state.isTrustBannerVisible, true);
});

test('useTrustStore trustCurrentWorkspace and restrictCurrentWorkspace transitions', async () => {
  const store = useTrustStore.getState();

  await store.trustCurrentWorkspace();
  let state = useTrustStore.getState();
  assert.equal(state.trustState, 'trusted');
  assert.equal(state.isTrusted, true);
  assert.equal(state.isTrustBannerVisible, false);

  await store.restrictCurrentWorkspace();
  state = useTrustStore.getState();
  assert.equal(state.trustState, 'restricted');
  assert.equal(state.isTrusted, false);
  assert.equal(state.isTrustBannerVisible, true);
});

test('NativeExtensionHost checkCapability respects trust state', async () => {
  await NativeExtensionHost.setWorkspaceTrust({ state: 'restricted' });
  const restrictedCheck = await NativeExtensionHost.checkCapability({ capability: 'spawnProcess' });
  assert.equal(restrictedCheck.allowed, false);

  await NativeExtensionHost.setWorkspaceTrust({ state: 'trusted' });
  const trustedCheck = await NativeExtensionHost.checkCapability({ capability: 'spawnProcess' });
  assert.equal(trustedCheck.allowed, true);
});

test('inspectExtensionPermissions extracts elevated permissions from manifest', () => {
  const declarativeTheme: ExtensionManifest = {
    name: 'pure-theme',
    publisher: 'alice',
    version: '1.0.0',
    contributes: {
      themes: [{ label: 'Dark', uiTheme: 'vs-dark', path: './theme.json' }],
    },
  };
  const themePerms = inspectExtensionPermissions(declarativeTheme);
  assert.equal(themePerms.length, 0);

  const powerfulExt: ExtensionManifest = {
    name: 'code-runner',
    publisher: 'bob',
    version: '2.0.0',
    main: './dist/extension.js',
    capabilities: {
      untrustedWorkspaces: {
        supported: false,
        description: 'Requires process execution to run code',
      },
    },
    contributes: {
      debuggers: [{ type: 'node', label: 'Node Debug' }],
    },
  };
  const runnerPerms = inspectExtensionPermissions(powerfulExt);
  assert.equal(runnerPerms.length >= 2, true);
  assert.ok(runnerPerms.some((p) => p.capability === 'spawnProcess'));
});

test('useTrustStore requestExtensionConsent triggers modal in restricted mode and auto-approves in trusted mode', async () => {
  const store = useTrustStore.getState();
  await store.restrictCurrentWorkspace();

  const powerfulExt: ExtensionManifest = {
    name: 'terminal-tool',
    publisher: 'charlie',
    version: '1.0.0',
    main: './out/main.js',
    capabilities: {
      untrustedWorkspaces: { supported: false },
    },
  };

  let confirmed = false;
  let cancelled = false;

  const shown = store.requestExtensionConsent(
    'charlie.terminal-tool',
    powerfulExt,
    () => { confirmed = true; },
    () => { cancelled = true; }
  );

  assert.equal(shown, true);
  const pending = useTrustStore.getState().pendingConsentModal;
  assert.ok(pending);
  assert.equal(pending?.extensionId, 'charlie.terminal-tool');

  // Trigger confirm
  pending?.onConfirm();
  assert.equal(confirmed, true);

  // In trusted mode, it auto-approves without showing modal
  await store.trustCurrentWorkspace();
  let autoConfirmed = false;
  const shownTrusted = store.requestExtensionConsent(
    'charlie.terminal-tool',
    powerfulExt,
    () => { autoConfirmed = true; },
    () => {}
  );
  assert.equal(shownTrusted, false);
  assert.equal(autoConfirmed, true);
});
