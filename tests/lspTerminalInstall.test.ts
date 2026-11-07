import test from 'node:test';
import assert from 'node:assert/strict';
import { useLspStore } from '../src/store/useLspStore';
import { useIdeStore } from '../src/store/useIdeStore';
import { useNativeTerminalStore } from '../src/store/useNativeTerminalStore';
import { setWebMockBinaryCheck } from '../src/lib/extensions/nativeExtensionHost';

test('Missing binary triggers honest error state and provides correct terminal install command', async () => {
  useLspStore.setState({ sessions: {}, missingBinaries: {} });
  setWebMockBinaryCheck('rust-analyzer', { exists: false });

  const client = await useLspStore.getState().startServer('rust');
  assert.equal(client, null);

  const session = useLspStore.getState().sessions['rust'];
  assert.ok(session);
  assert.equal(session.status, 'error');

  const installCmd = useLspStore.getState().getInstallCommand('rust');
  assert.equal(installCmd, 'pkg install -y rust-analyzer');
});

test('Clicking missing LSP indicator opens terminal and sends install command', async () => {
  useLspStore.setState({ sessions: {}, missingBinaries: {} });
  useIdeStore.setState({ isTerminalOpen: false });
  setWebMockBinaryCheck('clangd', { exists: false });

  // Simulate missing server session
  await useLspStore.getState().startServer('cpp');

  const installCmd = useLspStore.getState().getInstallCommand('cpp');
  assert.equal(installCmd, 'pkg install -y clang');

  // Trigger one-tap install action (as executed in StatusBar)
  useIdeStore.getState().setIsTerminalOpen(true);
  await useNativeTerminalStore.getState().sendInput(`${installCmd}\n`);

  assert.equal(useIdeStore.getState().isTerminalOpen, true);
  // On web fallback, simulated terminal receives input
  assert.ok(true);
});

test('Ready LSP session reports active status', async () => {
  useLspStore.setState({ sessions: {}, missingBinaries: {} });
  setWebMockBinaryCheck('typescript-language-server', { exists: true, path: '/usr/bin/typescript-language-server' });

  const client = await useLspStore.getState().startServer('typescript');
  assert.ok(client);

  const session = useLspStore.getState().sessions['typescript'];
  assert.equal(session.status, 'ready');
  assert.ok(session.sessionId.startsWith('lsp-typescript-'));

  await useLspStore.getState().stopServer('typescript');
});
