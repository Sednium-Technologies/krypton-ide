import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NativeExtensionHost,
  inspectExtensionPermissions,
  ExtensionManifest,
} from '../src/lib/extensions/nativeExtensionHost';
import { useTrustStore } from '../src/store/useTrustStore';

test('Extension Host Phase 5 E2E: Workspace Trust & Node.js Compat Integration', async () => {
  const trustStore = useTrustStore.getState();

  // 1. Initial State Verification (Confined to Restricted Mode)
  await trustStore.initializeTrust('/projects/krypton-sample');
  let state = useTrustStore.getState();

  assert.equal(state.trustState, 'restricted');
  assert.equal(state.isTrusted, false);
  assert.equal(state.workspaceRoot, '/projects/krypton-sample');
  assert.equal(state.isTrustBannerVisible, true);

  // 2. Security Capability Gating in Restricted Mode
  const restrictedSpawn = await NativeExtensionHost.checkCapability({ capability: 'spawnProcess' });
  assert.equal(restrictedSpawn.allowed, false);
  assert.ok(restrictedSpawn.error?.includes('SecurityError'));

  const restrictedNetwork = await NativeExtensionHost.checkCapability({ capability: 'network' });
  assert.equal(restrictedNetwork.allowed, false);

  const restrictedWrite = await NativeExtensionHost.checkCapability({ capability: 'fsWrite' });
  assert.equal(restrictedWrite.allowed, true); // Permitted within workspace boundaries

  // 3. Extension Manifest Capability Inspection
  const sampleDebuggerManifest: ExtensionManifest = {
    name: 'python-debug-adapter',
    publisher: 'ms-python',
    version: '1.2.0',
    main: './dist/debugAdapter.js',
    capabilities: {
      untrustedWorkspaces: {
        supported: false,
        description: 'Spawns debugpy subprocesses which execute arbitrary Python code',
      },
    },
    contributes: {
      debuggers: [
        {
          type: 'python',
          label: 'Python: Current File',
        },
      ],
    },
  };

  const detectedPerms = inspectExtensionPermissions(sampleDebuggerManifest);
  assert.equal(detectedPerms.length >= 2, true);
  assert.ok(detectedPerms.some((p) => p.capability === 'spawnProcess' && p.risk === 'high'));

  // 4. Consent Flow in Restricted Mode
  let consentConfirmed = false;
  let consentCancelled = false;

  const modalTriggered = trustStore.requestExtensionConsent(
    'ms-python.python-debug-adapter',
    sampleDebuggerManifest,
    () => { consentConfirmed = true; },
    () => { consentCancelled = true; }
  );

  assert.equal(modalTriggered, true);
  let pendingModal = useTrustStore.getState().pendingConsentModal;
  assert.ok(pendingModal);
  assert.equal(pendingModal?.extensionId, 'ms-python.python-debug-adapter');
  assert.equal(pendingModal?.manifest.name, 'python-debug-adapter');

  // Cancel first
  trustStore.closeConsentModal();
  assert.equal(consentCancelled, true);
  assert.equal(useTrustStore.getState().pendingConsentModal, null);

  // Re-request and confirm
  trustStore.requestExtensionConsent(
    'ms-python.python-debug-adapter',
    sampleDebuggerManifest,
    () => { consentConfirmed = true; },
    () => { consentCancelled = true; }
  );
  pendingModal = useTrustStore.getState().pendingConsentModal;
  assert.ok(pendingModal);
  pendingModal?.onConfirm();
  assert.equal(consentConfirmed, true);
  assert.equal(useTrustStore.getState().pendingConsentModal, null);

  // 5. Elevate Workspace to Trusted Mode
  await trustStore.trustCurrentWorkspace();
  state = useTrustStore.getState();

  assert.equal(state.trustState, 'trusted');
  assert.equal(state.isTrusted, true);
  assert.equal(state.isTrustBannerVisible, false);

  // All capabilities now allowed
  const trustedSpawn = await NativeExtensionHost.checkCapability({ capability: 'spawnProcess' });
  assert.equal(trustedSpawn.allowed, true);

  const trustedNetwork = await NativeExtensionHost.checkCapability({ capability: 'network' });
  assert.equal(trustedNetwork.allowed, true);

  // 6. Automatic Grant in Trusted Mode
  let autoApproved = false;
  const noModalInTrusted = trustStore.requestExtensionConsent(
    'ms-python.python-debug-adapter',
    sampleDebuggerManifest,
    () => { autoApproved = true; },
    () => {}
  );

  assert.equal(noModalInTrusted, false);
  assert.equal(autoApproved, true);
  assert.equal(useTrustStore.getState().pendingConsentModal, null);

  // 7. Re-restrict Workspace
  await trustStore.restrictCurrentWorkspace();
  state = useTrustStore.getState();
  assert.equal(state.trustState, 'restricted');
  assert.equal(state.isTrusted, false);
  assert.equal(state.isTrustBannerVisible, true);
});
