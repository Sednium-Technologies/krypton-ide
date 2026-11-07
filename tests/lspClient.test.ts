import test from 'node:test';
import assert from 'node:assert/strict';
import { LspClient } from '../src/lib/lsp/lspClient';
import { useLspStore } from '../src/store/useLspStore';
import { useProblemsStore } from '../src/store/useProblemsStore';
import { setWebMockBinaryCheck } from '../src/lib/extensions/nativeExtensionHost';

test('LspClient initializes and performs full handshake', async () => {
  const client = new LspClient({
    id: 'test-session-1',
    languageId: 'typescript',
    command: 'typescript-language-server',
    args: ['--stdio'],
  });

  await client.start();
  const initResult = await client.initialize('file:///test-project');

  assert.ok(initResult);
  assert.ok(initResult.capabilities);
  assert.ok(initResult.capabilities.completionProvider);
  assert.equal(client.capabilities.hoverProvider, true);

  await client.stop();
});

test('LspClient sends didOpen and receives publishDiagnostics notification', async () => {
  const client = new LspClient({
    id: 'test-session-2',
    languageId: 'typescript',
    command: 'typescript-language-server',
    args: ['--stdio'],
  });

  await client.start();
  await client.initialize();

  let receivedDiagnostics: any[] = [];
  const unsubscribe = client.onDiagnostics((params) => {
    receivedDiagnostics = params.diagnostics;
  });

  // Sending text containing 'trigger-error' causes mock to publish diagnostics
  await client.openDocument('file:///test-project/main.ts', 'typescript', 1, 'const x = trigger-error;');

  // Wait briefly for drain pump to receive message
  await new Promise((r) => setTimeout(r, 120));

  assert.equal(receivedDiagnostics.length, 1);
  assert.equal(receivedDiagnostics[0].severity, 1);
  assert.ok(receivedDiagnostics[0].message.includes('Syntax error'));

  unsubscribe();
  await client.stop();
});

test('LspClient handles completion, hover, and definition requests', async () => {
  const client = new LspClient({
    id: 'test-session-3',
    languageId: 'typescript',
    command: 'typescript-language-server',
    args: ['--stdio'],
  });

  await client.start();
  await client.initialize();

  // Completion
  const completions = await client.requestCompletion('file:///test.ts', 0, 5);
  assert.ok(completions.items);
  assert.equal(completions.items[0].label, 'mockCompletion');

  // Hover
  const hover = await client.requestHover('file:///test.ts', 0, 5);
  assert.ok(hover.contents);
  assert.ok(hover.contents.value.includes('Mock LSP Hover'));

  // Definition
  const def = await client.requestDefinition('file:///test.ts', 0, 5);
  assert.ok(Array.isArray(def));
  assert.equal(def.length, 1);

  await client.stop();
});

test('useLspStore handles missing binary honestly without crashing', async () => {
  useLspStore.setState({ sessions: {}, missingBinaries: {} });
  setWebMockBinaryCheck('pyright-langserver', { exists: false });

  const client = await useLspStore.getState().startServer('python');
  assert.equal(client, null);

  const session = useLspStore.getState().sessions['python'];
  assert.equal(session.status, 'error');
  assert.ok(session.error?.includes('not found'));
  assert.ok(session.error?.includes('npm install -g pyright'));

  const installCmd = useLspStore.getState().getInstallCommand('python');
  assert.equal(installCmd, 'npm install -g pyright');
});

test('useLspStore starts ready server when binary exists and wires diagnostics to problems store', async () => {
  useLspStore.setState({ sessions: {}, missingBinaries: {} });
  useProblemsStore.getState().clearProblems();
  setWebMockBinaryCheck('typescript-language-server', { exists: true, path: '/usr/bin/typescript-language-server' });

  const client = await useLspStore.getState().startServer('typescript');
  assert.ok(client);

  const session = useLspStore.getState().sessions['typescript'];
  assert.equal(session.status, 'ready');

  // Open file with trigger-error
  await useLspStore.getState().syncDocumentOpen('file:///workspace/test.ts', 'typescript', 'trigger-error code');
  await new Promise((r) => setTimeout(r, 120));

  const problems = useProblemsStore.getState().problems;
  assert.equal(problems.length, 1);
  assert.equal(problems[0].severity, 'error');
  assert.ok(problems[0].message.includes('Syntax error'));

  await useLspStore.getState().stopServer('typescript');
  assert.equal(useLspStore.getState().sessions['typescript'], undefined);
});
