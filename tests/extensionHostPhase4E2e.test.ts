import test from 'node:test';
import assert from 'node:assert/strict';
import { useLspStore } from '../src/store/useLspStore';
import { useProblemsStore } from '../src/store/useProblemsStore';
import { useIdeStore } from '../src/store/useIdeStore';
import { useNativeTerminalStore } from '../src/store/useNativeTerminalStore';
import {
  setWebMockBinaryCheck,
} from '../src/lib/extensions/nativeExtensionHost';
import {
  registerMonacoLspProviders,
  mapLspHover,
  mapLspLocation,
} from '../src/lib/lsp/monacoLspAdapter';

test('Phase 4 E2E: Full LSP Lifecycle, Monaco Adapter, Diagnostics, and Terminal UX', async () => {
  // 1. Verify Built-in Server Registry
  await useLspStore.getState().loadBuiltinServers();
  const servers = useLspStore.getState().builtinServers;
  assert.ok(servers.length >= 10);

  const pyServer = servers.find((s) => s.languageId === 'python');
  assert.ok(pyServer);
  assert.equal(pyServer.command, 'pyright-langserver');
  assert.equal(pyServer.installCommand, 'npm install -g pyright');

  const rustServer = servers.find((s) => s.languageId === 'rust');
  assert.ok(rustServer);
  assert.equal(rustServer.binary, 'rust-analyzer');
  assert.equal(rustServer.installCommand, 'pkg install -y rust-analyzer');

  // 2. Missing Binary Detection & Honest Error Reporting
  setWebMockBinaryCheck('pyright-langserver', { exists: false });
  const pyClient = await useLspStore.getState().startServer('python');
  assert.equal(pyClient, null);

  const pySession = useLspStore.getState().sessions['python'];
  assert.ok(pySession);
  assert.equal(pySession.status, 'error');
  assert.ok(pySession.error?.includes('not found'));

  const pyInstallCmd = useLspStore.getState().getInstallCommand('python');
  assert.equal(pyInstallCmd, 'npm install -g pyright');

  // 3. One-Tap Terminal Install Dispatch
  useIdeStore.setState({ isTerminalOpen: false });
  useIdeStore.getState().setIsTerminalOpen(true);
  await useNativeTerminalStore.getState().sendInput(`${pyInstallCmd}\n`);
  assert.equal(useIdeStore.getState().isTerminalOpen, true);

  // 4. Server Startup & JSON-RPC Initialize Handshake
  setWebMockBinaryCheck('typescript-language-server', {
    exists: true,
    path: '/usr/bin/typescript-language-server',
  });
  useProblemsStore.getState().clearProblems();

  const tsClient = await useLspStore.getState().startServer('typescript');
  assert.ok(tsClient);
  assert.equal(tsClient.sessionId.startsWith('lsp-typescript-'), true);

  const tsSession = useLspStore.getState().sessions['typescript'];
  assert.equal(tsSession.status, 'ready');
  assert.ok(tsClient.capabilities.completionProvider);
  assert.equal(tsClient.capabilities.hoverProvider, true);

  // 5. Monaco Provider Registration
  const mockMonaco = {
    languages: {
      CompletionItemKind: { Text: 1, Method: 2, Function: 3, Property: 10 },
      registerCompletionItemProvider: (_lang: string, prov: any) => ({
        provideCompletionItems: prov.provideCompletionItems,
        dispose: () => {},
      }),
      registerHoverProvider: (_lang: string, prov: any) => ({
        provideHover: prov.provideHover,
        dispose: () => {},
      }),
      registerDefinitionProvider: (_lang: string, prov: any) => ({
        provideDefinition: prov.provideDefinition,
        dispose: () => {},
      }),
    },
    MarkerSeverity: { Error: 8, Warning: 4, Info: 2, Hint: 1 },
    Uri: { parse: (u: string) => ({ toString: () => u }) },
    Range: class Range {
      constructor(
        public startLineNumber: number,
        public startColumn: number,
        public endLineNumber: number,
        public endColumn: number
      ) {}
    },
  };

  const monacoRegistration = registerMonacoLspProviders(mockMonaco);
  assert.ok(monacoRegistration);

  // 6. Document Synchronization & Diagnostics Streaming
  const docUri = 'file:///workspace/src/index.ts';
  await useLspStore.getState().syncDocumentOpen(docUri, 'typescript', 'const a = trigger-error;');
  await new Promise((r) => setTimeout(r, 120));

  const problems = useProblemsStore.getState().problems;
  assert.equal(problems.length, 1);
  assert.equal(problems[0].filePath, docUri);
  assert.equal(problems[0].severity, 'error');
  assert.ok(problems[0].message.includes('Syntax error'));

  // Document Change
  await useLspStore.getState().syncDocumentChange(docUri, 'typescript', 'const a = 123;');
  assert.equal(useLspStore.getState().documentVersions[docUri], 2);

  // 7. Completion, Hover, and Definition Queries
  const completions = await tsClient.requestCompletion(docUri, 0, 5);
  assert.ok(completions.items);
  assert.equal(completions.items[0].label, 'mockCompletion');

  const hover = await tsClient.requestHover(docUri, 0, 5);
  const mappedHover = mapLspHover(hover);
  assert.ok(mappedHover?.contents[0].value.includes('Mock LSP Hover'));

  const def = await tsClient.requestDefinition(docUri, 0, 5);
  const mappedDef = mapLspLocation(def, mockMonaco);
  assert.ok(mappedDef);
  const targetLoc = Array.isArray(mappedDef) ? mappedDef[0] : mappedDef;
  assert.equal(targetLoc.range.startLineNumber, 1);

  // 8. Document Close & Clean Server Shutdown
  await useLspStore.getState().syncDocumentClose(docUri, 'typescript');
  assert.equal(useLspStore.getState().documentVersions[docUri], undefined);

  monacoRegistration.dispose();
  await useLspStore.getState().stopServer('typescript');
  assert.equal(useLspStore.getState().sessions['typescript'], undefined);
});
