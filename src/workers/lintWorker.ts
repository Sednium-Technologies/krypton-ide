import * as Comlink from 'comlink';

export interface LintDiagnostic {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export class LintWorkerImpl {
  async lint(path: string, content: string, language: string): Promise<LintDiagnostic[]> {
    const diagnostics: LintDiagnostic[] = [];

    if (!content.trim()) return diagnostics;

    // JSON Validation
    if (language === 'json' || path.endsWith('.json')) {
      try {
        JSON.parse(content);
      } catch (err: any) {
        const match = err.message.match(/at position (\d+)/) || err.message.match(/line (\d+) column (\d+)/);
        let line = 1;
        let col = 1;

        if (match && match[1] && !match[2]) {
          const pos = parseInt(match[1], 10);
          const lines = content.slice(0, pos).split('\n');
          line = lines.length;
          col = (lines[lines.length - 1]?.length || 0) + 1;
        } else if (match && match[1] && match[2]) {
          line = parseInt(match[1], 10);
          col = parseInt(match[2], 10);
        }

        diagnostics.push({
          startLineNumber: line,
          startColumn: col,
          endLineNumber: line,
          endColumn: col + 10,
          message: err.message || 'Invalid JSON syntax',
          severity: 'error',
        });
      }
    }

    // Basic JS/TS lint checks
    if (['javascript', 'typescript', 'javascriptreact', 'typescriptreact'].includes(language)) {
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Check for debugger statements
        if (/\bdebugger\b/.test(line)) {
          diagnostics.push({
            startLineNumber: i + 1,
            startColumn: line.indexOf('debugger') + 1,
            endLineNumber: i + 1,
            endColumn: line.indexOf('debugger') + 9,
            message: 'Unexpected debugger statement',
            severity: 'warning',
          });
        }
        // Check for console.log statements
        if (/\bconsole\.log\b/.test(line)) {
          diagnostics.push({
            startLineNumber: i + 1,
            startColumn: line.indexOf('console.log') + 1,
            endLineNumber: i + 1,
            endColumn: line.indexOf('console.log') + 12,
            message: 'Unexpected console.log statement',
            severity: 'info',
          });
        }
      }
    }

    return diagnostics;
  }
}

const lintWorker = new LintWorkerImpl();
Comlink.expose(lintWorker);
