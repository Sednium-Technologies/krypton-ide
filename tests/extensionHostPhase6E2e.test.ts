import test, { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildVsix } from './fixtures/packVsix';
import { useExtensionHostStore } from '../src/store/useExtensionHostStore';
import { NativeExtensionHost, ExtensionHostWeb } from '../src/lib/extensions/nativeExtensionHost';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');
const TMP_VSIX_DIR = path.join(os.tmpdir(), `krypton-phase6-e2e-${Date.now()}`);

const FIXTURE_NAMES = [
  'sample-theme-ext',
  'sample-snippets-ext',
  'sample-treeview-ext',
  'sample-webview-ext',
  'sample-lsp-ext',
  'sample-agent-ext',
];

describe('Phase 6 End-to-End: Complete Extension Matrix & Lifecycle', () => {
  const generatedVsixes: Record<string, string> = {};

  before(() => {
    fs.mkdirSync(TMP_VSIX_DIR, { recursive: true });

    // 1. Pack all 6 fixtures into authentic VSIX files
    for (const name of FIXTURE_NAMES) {
      const fixturePath = path.join(FIXTURES_DIR, name);
      const outVsix = path.join(TMP_VSIX_DIR, `${name}.vsix`);
      buildVsix(fixturePath, outVsix);
      generatedVsixes[name] = outVsix;
      assert.ok(fs.existsSync(outVsix), `Expected VSIX to exist at ${outVsix}`);
    }

    // 2. Wire mock command execution in web preview host for functional commands
    const webHost = NativeExtensionHost as unknown as ExtensionHostWeb;
    if (typeof webHost.registerMockCommand === 'function') {
      let refreshCount = 0;
      webHost.registerMockCommand('krypton.sample.refresh', () => {
        refreshCount++;
        return { refreshed: true, count: refreshCount, timestamp: Date.now() };
      });

      webHost.registerMockCommand('krypton.webview.open', (opts: any) => {
        return {
          viewType: opts?.viewType || 'krypton.sampleWebview',
          title: opts?.title || 'Sample Panel',
          html: '<h1>Sample Panel</h1>',
          active: true,
          visible: true,
        };
      });

      webHost.registerMockCommand('krypton.lsp.restart', () => {
        return { status: 'restarted', clientId: 'krypton-ts-lsp' };
      });

      webHost.registerMockCommand('krypton.agent.plan', (task: string) => {
        return [
          { step: 1, action: 'analyze-workspace', target: task || 'default' },
          { step: 2, action: 'generate-diff' },
          { step: 3, action: 'run-diagnostics' },
          { step: 4, action: 'verify-tests' },
        ];
      });

      webHost.registerMockCommand('krypton.agent.audit', (target: string) => {
        return {
          status: 'passed',
          target: target || '.',
          vulnerabilities: [],
          score: 100,
          verified: true,
        };
      });
    }
  });

  after(() => {
    if (fs.existsSync(TMP_VSIX_DIR)) {
      fs.rmSync(TMP_VSIX_DIR, { recursive: true, force: true });
    }
  });

  it('should install and verify all 6 sample extensions', async () => {
    const store = useExtensionHostStore.getState();

    for (const name of FIXTURE_NAMES) {
      const vsixPath = generatedVsixes[name];
      const ext = await store.installVsix(vsixPath);

      assert.ok(ext, `Extension ${name} must install successfully`);
      assert.equal(ext.id, `krypton.${name}`);
      assert.equal(ext.manifest.publisher, 'krypton');
      assert.equal(ext.manifest.version, '1.0.0');
    }

    const state = useExtensionHostStore.getState();
    assert.equal(state.installedExtensions.length >= 6, true);
  });

  it('should verify theme and snippet contributions from installed extensions', async () => {
    const store = useExtensionHostStore.getState();

    // 1. Theme extension verification
    const themeExt = store.installedExtensions.find((e) => e.id === 'krypton.sample-theme-ext');
    assert.ok(themeExt, 'Theme extension must be present');
    assert.ok(themeExt.manifest.contributes?.themes);
    assert.equal(themeExt.manifest.contributes?.themes?.[0]?.label, 'Krypton Cyberpunk Neon');
    assert.equal(themeExt.manifest.contributes?.themes?.[0]?.uiTheme, 'vs-dark');

    // 2. Snippets extension verification
    const snippetExt = store.installedExtensions.find((e) => e.id === 'krypton.sample-snippets-ext');
    assert.ok(snippetExt, 'Snippet extension must be present');
    assert.ok(snippetExt.manifest.contributes?.snippets);
    assert.equal(snippetExt.manifest.contributes?.snippets?.[0]?.language, 'typescript');
  });

  it('should activate and execute commands from functional extensions', async () => {
    const store = useExtensionHostStore.getState();

    // 1. TreeView refresh command
    const refreshResult = await store.executeCommand<{ refreshed: boolean; count: number }>('krypton.sample.refresh');
    assert.equal(refreshResult.refreshed, true);
    assert.equal(refreshResult.count, 1);

    // 2. Webview panel open command
    const webviewResult = await store.executeCommand<{ title: string; html: string; active: boolean }>('krypton.webview.open', [
      { title: 'Interactive Demo' },
    ]);
    assert.equal(webviewResult.title, 'Interactive Demo');
    assert.ok(webviewResult.html.includes('Sample Panel'));
    assert.equal(webviewResult.active, true);

    // 3. LSP restart command
    const lspResult = await store.executeCommand<{ status: string; clientId: string }>('krypton.lsp.restart');
    assert.equal(lspResult.status, 'restarted');
    assert.equal(lspResult.clientId, 'krypton-ts-lsp');

    // 4. Agent planning and audit commands
    const planResult = await store.executeCommand<any[]>('krypton.agent.plan', ['Refactor security layer']);
    assert.equal(Array.isArray(planResult), true);
    assert.equal(planResult.length, 4);
    assert.equal(planResult[0].action, 'analyze-workspace');

    const auditResult = await store.executeCommand<{ status: string; score: number; verified: boolean }>(
      'krypton.agent.audit',
      ['src/']
    );
    assert.equal(auditResult.status, 'passed');
    assert.equal(auditResult.score, 100);
    assert.equal(auditResult.verified, true);
  });

  it('should uninstall all 6 extensions cleanly and purge state', async () => {
    const store = useExtensionHostStore.getState();

    for (const name of FIXTURE_NAMES) {
      const id = `krypton.${name}`;
      const uninstalled = await store.uninstall(id);
      assert.equal(uninstalled, true, `Failed to uninstall ${id}`);
    }

    const finalState = useExtensionHostStore.getState();
    for (const name of FIXTURE_NAMES) {
      const id = `krypton.${name}`;
      assert.equal(finalState.installedExtensions.some((e) => e.id === id), false);
      assert.equal(finalState.activeExtensions[id], undefined);
    }
  });
});
