import { useLspStore } from '../../store/useLspStore';
import { LspDiagnostic } from './lspClient';

/**
 * Maps LSP CompletionItemKind (1-25) to Monaco CompletionItemKind.
 */
export function mapLspCompletionKind(kind: number | undefined, monaco: any): number {
  if (!monaco?.languages?.CompletionItemKind) return 0;
  const kinds = monaco.languages.CompletionItemKind;
  switch (kind) {
    case 1: return kinds.Text;
    case 2: return kinds.Method;
    case 3: return kinds.Function;
    case 4: return kinds.Constructor;
    case 5: return kinds.Field;
    case 6: return kinds.Variable;
    case 7: return kinds.Class;
    case 8: return kinds.Interface;
    case 9: return kinds.Module;
    case 10: return kinds.Property;
    case 11: return kinds.Unit;
    case 12: return kinds.Value;
    case 13: return kinds.Enum;
    case 14: return kinds.Keyword;
    case 15: return kinds.Snippet;
    case 16: return kinds.Color;
    case 17: return kinds.File;
    case 18: return kinds.Reference;
    case 19: return kinds.Folder;
    case 20: return kinds.EnumMember;
    case 21: return kinds.Constant;
    case 22: return kinds.Struct;
    case 23: return kinds.Event;
    case 24: return kinds.Operator;
    case 25: return kinds.TypeParameter;
    default: return kinds.Property;
  }
}

/**
 * Maps LSP hover content (string, MarkedString, MarkupContent) to Monaco IMarkdownString[].
 */
export function mapLspHover(hover: any): { contents: Array<{ value: string }> } | null {
  if (!hover || !hover.contents) return null;
  const contents = hover.contents;

  if (typeof contents === 'string') {
    return { contents: [{ value: contents }] };
  }
  if (contents.kind && contents.value) {
    return { contents: [{ value: contents.value }] };
  }
  if (Array.isArray(contents)) {
    const list = contents.map((c) => (typeof c === 'string' ? { value: c } : { value: c.value || '' }));
    return { contents: list };
  }
  if (typeof contents.value === 'string') {
    return { contents: [{ value: contents.value }] };
  }
  return null;
}

/**
 * Maps LSP Location or Location[] to Monaco location(s).
 */
export function mapLspLocation(loc: any, monaco: any): any {
  if (!loc) return null;
  const makeMonacoLoc = (l: any) => {
    const uri = monaco?.Uri?.parse ? monaco.Uri.parse(l.uri) : l.uri;
    const startLine = (l.range?.start?.line ?? 0) + 1;
    const startCol = (l.range?.start?.character ?? 0) + 1;
    const endLine = (l.range?.end?.line ?? l.range?.start?.line ?? 0) + 1;
    const endCol = (l.range?.end?.character ?? l.range?.start?.character ?? 0) + 1;

    return {
      uri,
      range: monaco?.Range ? new monaco.Range(startLine, startCol, endLine, endCol) : { startLine, startCol, endLine, endCol },
    };
  };

  if (Array.isArray(loc)) {
    return loc.map(makeMonacoLoc);
  }
  return makeMonacoLoc(loc);
}

/**
 * Maps LSP Diagnostics to Monaco Editor markers.
 */
export function mapLspDiagnosticsToMarkers(diagnostics: LspDiagnostic[], monaco: any): any[] {
  if (!Array.isArray(diagnostics)) return [];

  // Monaco MarkerSeverity: 1=Hint, 2=Info, 4=Warning, 8=Error
  const markerSeverity = monaco?.MarkerSeverity || {
    Error: 8,
    Warning: 4,
    Info: 2,
    Hint: 1,
  };

  return diagnostics.map((d) => {
    let severity = markerSeverity.Info;
    if (d.severity === 1) severity = markerSeverity.Error;
    else if (d.severity === 2) severity = markerSeverity.Warning;
    else if (d.severity === 3) severity = markerSeverity.Info;
    else if (d.severity === 4) severity = markerSeverity.Hint;

    const startLineNumber = (d.range?.start?.line ?? 0) + 1;
    const startColumn = (d.range?.start?.character ?? 0) + 1;
    const endLineNumber = (d.range?.end?.line ?? d.range?.start?.line ?? 0) + 1;
    const endColumn = (d.range?.end?.character ?? d.range?.start?.character ?? 0) + 1;

    return {
      severity,
      message: d.message,
      startLineNumber,
      startColumn,
      endLineNumber,
      endColumn,
      source: d.source || 'LSP',
      code: d.code ? String(d.code) : undefined,
    };
  });
}

const SUPPORTED_LSP_LANGUAGES = [
  'typescript',
  'javascript',
  'typescriptreact',
  'javascriptreact',
  'python',
  'rust',
  'cpp',
  'c',
  'go',
  'json',
  'html',
  'css',
];

/**
 * Registers LSP completion, hover, and definition providers with Monaco.
 */
export function registerMonacoLspProviders(monaco: any): { dispose: () => void } {
  if (!monaco?.languages) {
    return { dispose: () => {} };
  }

  const disposables: Array<{ dispose: () => void }> = [];

  for (const lang of SUPPORTED_LSP_LANGUAGES) {
    try {
      // 1. Completion Item Provider
      const compDisp = monaco.languages.registerCompletionItemProvider(lang, {
        triggerCharacters: ['.', ':', '>', '"', '/', '@'],
        provideCompletionItems: async (model: any, position: any) => {
          const client = useLspStore.getState().getClient(lang);
          if (!client) {
            return { suggestions: [] };
          }

          const uri = model.uri.toString();
          const line = position.lineNumber - 1;
          const character = position.column - 1;

          try {
            const res = await client.requestCompletion(uri, line, character);
            const items = Array.isArray(res) ? res : res?.items || [];
            const word = model.getWordUntilPosition(position);
            const range = {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endColumn: word.endColumn,
            };

            const suggestions = items.map((it: any) => ({
              label: it.label,
              kind: mapLspCompletionKind(it.kind, monaco),
              detail: it.detail,
              documentation: typeof it.documentation === 'object' ? it.documentation.value : it.documentation,
              insertText: it.insertText || (typeof it.label === 'string' ? it.label : it.label?.label || ''),
              range,
              sortText: it.sortText,
              filterText: it.filterText,
            }));

            return { suggestions };
          } catch {
            return { suggestions: [] };
          }
        },
      });
      disposables.push(compDisp);

      // 2. Hover Provider
      const hoverDisp = monaco.languages.registerHoverProvider(lang, {
        provideHover: async (model: any, position: any) => {
          const client = useLspStore.getState().getClient(lang);
          if (!client) return null;

          const uri = model.uri.toString();
          const line = position.lineNumber - 1;
          const character = position.column - 1;

          try {
            const res = await client.requestHover(uri, line, character);
            return mapLspHover(res);
          } catch {
            return null;
          }
        },
      });
      disposables.push(hoverDisp);

      // 3. Definition Provider
      const defDisp = monaco.languages.registerDefinitionProvider(lang, {
        provideDefinition: async (model: any, position: any) => {
          const client = useLspStore.getState().getClient(lang);
          if (!client) return null;

          const uri = model.uri.toString();
          const line = position.lineNumber - 1;
          const character = position.column - 1;

          try {
            const res = await client.requestDefinition(uri, line, character);
            return mapLspLocation(res, monaco);
          } catch {
            return null;
          }
        },
      });
      disposables.push(defDisp);
    } catch {
      // Language might not be supported or registered in this Monaco instance
    }
  }

  return {
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
