import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapLspCompletionKind,
  mapLspHover,
  mapLspLocation,
  mapLspDiagnosticsToMarkers,
  registerMonacoLspProviders,
} from '../src/lib/lsp/monacoLspAdapter';
import { useLspStore } from '../src/store/useLspStore';
import { setWebMockBinaryCheck } from '../src/lib/extensions/nativeExtensionHost';

const mockMonaco = {
  languages: {
    CompletionItemKind: {
      Text: 1,
      Method: 2,
      Function: 3,
      Constructor: 4,
      Field: 5,
      Variable: 6,
      Class: 7,
      Interface: 8,
      Property: 10,
    },
    registerCompletionItemProvider: (_lang: string, provider: any) => ({
      provider,
      dispose: () => {},
    }),
    registerHoverProvider: (_lang: string, provider: any) => ({
      provider,
      dispose: () => {},
    }),
    registerDefinitionProvider: (_lang: string, provider: any) => ({
      provider,
      dispose: () => {},
    }),
  },
  MarkerSeverity: {
    Error: 8,
    Warning: 4,
    Info: 2,
    Hint: 1,
  },
  Uri: {
    parse: (u: string) => ({ toString: () => u }),
  },
  Range: class Range {
    constructor(
      public startLineNumber: number,
      public startColumn: number,
      public endLineNumber: number,
      public endColumn: number
    ) {}
  },
};

test('mapLspCompletionKind maps kinds accurately to Monaco', () => {
  assert.equal(mapLspCompletionKind(1, mockMonaco), mockMonaco.languages.CompletionItemKind.Text);
  assert.equal(mapLspCompletionKind(3, mockMonaco), mockMonaco.languages.CompletionItemKind.Function);
  assert.equal(mapLspCompletionKind(6, mockMonaco), mockMonaco.languages.CompletionItemKind.Variable);
  assert.equal(mapLspCompletionKind(7, mockMonaco), mockMonaco.languages.CompletionItemKind.Class);
  assert.equal(mapLspCompletionKind(999, mockMonaco), mockMonaco.languages.CompletionItemKind.Property);
});

test('mapLspHover maps string, MarkupContent, and list structures', () => {
  // String
  const h1 = mapLspHover({ contents: 'Simple hover string' });
  assert.deepEqual(h1, { contents: [{ value: 'Simple hover string' }] });

  // MarkupContent
  const h2 = mapLspHover({ contents: { kind: 'markdown', value: '### Header' } });
  assert.deepEqual(h2, { contents: [{ value: '### Header' }] });

  // Array of MarkedStrings
  const h3 = mapLspHover({ contents: ['item 1', { language: 'ts', value: 'item 2' }] });
  assert.deepEqual(h3, { contents: [{ value: 'item 1' }, { value: 'item 2' }] });

  // Null/empty
  assert.equal(mapLspHover(null), null);
  assert.equal(mapLspHover({}), null);
});

test('mapLspLocation converts 0-indexed LSP coordinates to 1-indexed Monaco Range', () => {
  const lspLoc = {
    uri: 'file:///workspace/app.ts',
    range: {
      start: { line: 9, character: 4 },
      end: { line: 9, character: 15 },
    },
  };

  const monacoLoc = mapLspLocation(lspLoc, mockMonaco);
  assert.equal(monacoLoc.uri.toString(), 'file:///workspace/app.ts');
  assert.equal(monacoLoc.range.startLineNumber, 10);
  assert.equal(monacoLoc.range.startColumn, 5);
  assert.equal(monacoLoc.range.endLineNumber, 10);
  assert.equal(monacoLoc.range.endColumn, 16);
});

test('mapLspDiagnosticsToMarkers transforms LSP diagnostics into editor markers', () => {
  const lspDiagnostics = [
    {
      range: {
        start: { line: 0, character: 2 },
        end: { line: 0, character: 10 },
      },
      severity: 1, // Error
      message: 'Unexpected token',
      source: 'tsc',
      code: 'TS1005',
    },
    {
      range: {
        start: { line: 5, character: 0 },
        end: { line: 5, character: 8 },
      },
      severity: 2, // Warning
      message: 'Variable unused',
      source: 'eslint',
    },
  ];

  const markers = mapLspDiagnosticsToMarkers(lspDiagnostics, mockMonaco);
  assert.equal(markers.length, 2);

  assert.equal(markers[0].severity, 8); // Monaco Error
  assert.equal(markers[0].message, 'Unexpected token');
  assert.equal(markers[0].startLineNumber, 1);
  assert.equal(markers[0].startColumn, 3);
  assert.equal(markers[0].code, 'TS1005');

  assert.equal(markers[1].severity, 4); // Monaco Warning
  assert.equal(markers[1].message, 'Variable unused');
  assert.equal(markers[1].startLineNumber, 6);
  assert.equal(markers[1].startColumn, 1);
});

test('registerMonacoLspProviders registers completions, hover, and definition providers', async () => {
  useLspStore.setState({ sessions: {}, missingBinaries: {} });
  setWebMockBinaryCheck('typescript-language-server', { exists: true });

  const registration = registerMonacoLspProviders(mockMonaco);
  assert.ok(registration);
  assert.equal(typeof registration.dispose, 'function');

  // Start TypeScript server
  await useLspStore.getState().startServer('typescript');

  // Verify registration disposal works cleanly
  registration.dispose();
  await useLspStore.getState().stopServer('typescript');
});
