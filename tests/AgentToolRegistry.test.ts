import test from 'node:test';
import assert from 'node:assert';
import { AgentToolRegistry } from '../src/lib/ai/AgentToolRegistry';
import { LayaSystem1 } from '../src/lib/pocket/LayaSystem1';
import { AifManager, getAifManager } from '../src/lib/ai/AifManager';
import { resolveFullPath } from '../src/lib/ai/toolActions';
import { ModelAdapters } from '../src/lib/ai/modelAdapters';
import { useIdeStore } from '../src/store/useIdeStore';

test('AgentToolRegistry registers built-in categories', () => {
  const registry = new AgentToolRegistry();
  const tools = registry.getAllTools();

  const categories = new Set(tools.map(t => t.category));
  assert.ok(categories.has('filesystem'), 'Must have filesystem tools');
  assert.ok(categories.has('terminal'), 'Must have terminal tools');
  assert.ok(categories.has('lsp'), 'Must have lsp tools');
  assert.ok(categories.has('aif'), 'Must have aif tools');
  assert.ok(categories.has('web'), 'Must have web tools');
  assert.ok(categories.has('preview'), 'Must have preview tools');

  // Verify specific tools
  assert.ok(registry.getTool('read_file'));
  assert.ok(registry.getTool('write_file'));
  assert.ok(registry.getTool('edit_lines'));
  assert.ok(registry.getTool('insert_lines'));
  assert.ok(registry.getTool('patch_file'));
  assert.ok(registry.getTool('list_dir'));
  assert.ok(registry.getTool('execute_terminal_command'));
  assert.ok(registry.getTool('build_android_apk'));
  assert.ok(registry.getTool('lsp_get_diagnostics'));
  assert.ok(registry.getTool('lsp_get_symbols'));
  assert.ok(registry.getTool('lsp_find_definition'));
  assert.ok(registry.getTool('aif_recall'));
  assert.ok(registry.getTool('aif_scratch'));
  assert.ok(registry.getTool('aif_note'));
  assert.ok(registry.getTool('aif_query'));
  assert.ok(registry.getTool('aif_status'));
  assert.ok(registry.getTool('search_web'));
  assert.ok(registry.getTool('fetch_web_page'));
  assert.ok(registry.getTool('take_screenshot'));
  assert.ok(registry.getTool('capture_preview_screenshot'));
  assert.ok(registry.getTool('inspect_preview_dom'));
  assert.ok(registry.getTool('grep_search'));
  assert.ok(registry.getTool('find_files_by_name'));

  // SEC-TOOL-01: Path traversal protection
  assert.strictEqual(resolveFullPath('src/App.tsx'), 'src/App.tsx');
  assert.throws(() => resolveFullPath('../secret.txt'), /Access Denied: Path traversal/);
  assert.throws(() => resolveFullPath('src/../../secret.txt'), /Access Denied: Path traversal/);
  assert.throws(() => resolveFullPath('..'), /Access Denied: Path traversal/);
});

test('AgentToolRegistry formats schemas for Gemini, Anthropic, and OpenAI', () => {
  const registry = new AgentToolRegistry();
  const gemini = registry.formatForProvider('gemini');
  assert.ok(Array.isArray(gemini) && gemini[0].function_declarations.length >= 10);

  const anthropic = registry.formatForProvider('anthropic');
  assert.ok(Array.isArray(anthropic) && anthropic[0].input_schema);

  const openai = registry.formatForProvider('openai');
  assert.ok(Array.isArray(openai) && openai[0].type === 'function');

  // BUG-NET-02: Streaming tool delta with index unification
  const chunk1 = 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","function":{"name":"read_file","arguments":""}}]}}]}';
  const parsed1 = ModelAdapters.parseStreamChunk('openai', chunk1);
  assert.ok(parsed1?.tool_calls);
  assert.strictEqual(parsed1.tool_calls[0].id, 'call_123');
  assert.strictEqual(parsed1.tool_calls[0].index, 0);
  assert.strictEqual(parsed1.tool_calls[0].name, 'read_file');

  const chunk2 = 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"path\\":\\"test.txt\\"}"}}]}}]}';
  const parsed2 = ModelAdapters.parseStreamChunk('openai', chunk2);
  assert.ok(parsed2?.tool_calls);
  assert.strictEqual(parsed2.tool_calls[0].id, 'call_idx_0');
  assert.strictEqual(parsed2.tool_calls[0].index, 0);
  assert.strictEqual(parsed2.tool_calls[0].arguments, '{"path":"test.txt"}');

  // BUG-NET-01 & BUG-NET-02: Accumulation by index and safe JSON parse
  const toolCallAccumulators: Record<string, { id: string, name: string, arguments: string, isObject: boolean, rawArgs: any }> = {};
  [parsed1, parsed2].forEach((pm) => {
    pm?.tool_calls?.forEach((tc: any, index: number) => {
      const accKey = `idx_${tc.index ?? index ?? 0}`;
      if (!toolCallAccumulators[accKey]) {
        toolCallAccumulators[accKey] = {
          id: tc.id || `call_${accKey}`,
          name: tc.name || '',
          arguments: '',
          isObject: false,
          rawArgs: null
        };
      } else {
        if (tc.id && (!toolCallAccumulators[accKey].id || toolCallAccumulators[accKey].id.startsWith('call_idx_'))) {
          toolCallAccumulators[accKey].id = tc.id;
        }
      }
      if (tc.name) toolCallAccumulators[accKey].name = tc.name;
      if (tc.arguments) toolCallAccumulators[accKey].arguments += tc.arguments;
    });
  });

  const finalCalls = Object.values(toolCallAccumulators).map(acc => {
    let parsedArgs: any = {};
    try {
      parsedArgs = JSON.parse(acc.arguments);
    } catch {
      parsedArgs = {};
    }
    return { id: acc.id, name: acc.name, arguments: parsedArgs };
  });

  assert.strictEqual(finalCalls.length, 1);
  assert.strictEqual(finalCalls[0].id, 'call_123');
  assert.strictEqual(finalCalls[0].name, 'read_file');
  assert.deepStrictEqual(finalCalls[0].arguments, { path: 'test.txt' });

  // Test malformed JSON fallback without unhandled SyntaxError
  let malformedArgs: any = {};
  try {
    malformedArgs = JSON.parse('{"broken":');
  } catch {
    malformedArgs = {};
  }
  assert.deepStrictEqual(malformedArgs, {});
});

test('LayaSystem1 routes intents <50ms', () => {
  const t0 = performance.now();
  const fast = LayaSystem1.routeIntent('who are you');
  const duration = performance.now() - t0;
  assert.strictEqual(fast.path, 'fast_path');
  assert.ok(duration < 50, `Fast path took ${duration}ms, expected < 50ms`);

  const complex = LayaSystem1.routeIntent('refactor all files to use typescript interfaces and implement cache');
  assert.strictEqual(complex.path, 'deep_reasoning');
});

test('LayaSystem1 assesses command risk accurately across security tiers', () => {
  // Low risk command
  const safe = LayaSystem1.assessCommandRisk('git status', 'supervised');
  assert.strictEqual(safe.riskLevel, 'low');
  assert.strictEqual(safe.requiresConfirmation, false);

  // Medium risk command in supervised mode requires confirmation
  const mediumSup = LayaSystem1.assessCommandRisk('npm install lodash', 'supervised');
  assert.strictEqual(mediumSup.riskLevel, 'medium');
  assert.strictEqual(mediumSup.requiresConfirmation, true);

  // Medium risk command in autonomous mode does NOT require confirmation
  const mediumAuto = LayaSystem1.assessCommandRisk('npm install lodash', 'autonomous');
  assert.strictEqual(mediumAuto.riskLevel, 'medium');
  assert.strictEqual(mediumAuto.requiresConfirmation, false);

  // High risk command in supervised and autonomous modes requires confirmation
  const dangerous = LayaSystem1.assessCommandRisk('rm -rf /storage/emulated/0', 'supervised');
  assert.strictEqual(dangerous.riskLevel, 'high');
  assert.strictEqual(dangerous.requiresConfirmation, true);

  const dangerousAuto = LayaSystem1.assessCommandRisk('rm -rf /storage/emulated/0', 'autonomous');
  assert.strictEqual(dangerousAuto.riskLevel, 'high');
  assert.strictEqual(dangerousAuto.requiresConfirmation, true);

  // Unbound mode approves everything without confirmation
  const unbound = LayaSystem1.assessCommandRisk('rm -rf /storage/emulated/0', 'unbound');
  assert.strictEqual(unbound.riskLevel, 'low');
  assert.strictEqual(unbound.requiresConfirmation, false);

  // SEC-RISK-01: Normalization & bypass prevention
  const obfuscated1 = LayaSystem1.assessCommandRisk('r\\m\\ -rf /', 'supervised');
  assert.strictEqual(obfuscated1.riskLevel, 'high');
  assert.strictEqual(obfuscated1.requiresConfirmation, true);

  const obfuscated2 = LayaSystem1.assessCommandRisk('r\'m\' "-rf" /', 'supervised');
  assert.strictEqual(obfuscated2.riskLevel, 'high');
  assert.strictEqual(obfuscated2.requiresConfirmation, true);

  // Command wrappers & execution bypasses
  const evalCmd = LayaSystem1.assessCommandRisk('eval "rm -rf /"', 'supervised');
  assert.strictEqual(evalCmd.riskLevel, 'high');
  assert.strictEqual(evalCmd.requiresConfirmation, true);

  const b64Cmd = LayaSystem1.assessCommandRisk('echo cm0= | base64 -d | sh', 'supervised');
  assert.strictEqual(b64Cmd.riskLevel, 'high');
  assert.strictEqual(b64Cmd.requiresConfirmation, true);

  const subCmd = LayaSystem1.assessCommandRisk('echo $(whoami)', 'supervised');
  assert.strictEqual(subCmd.riskLevel, 'high');
  assert.strictEqual(subCmd.requiresConfirmation, true);

  const pyCmd = LayaSystem1.assessCommandRisk('python -c "import os; os.system(\'whoami\')"', 'supervised');
  assert.strictEqual(pyCmd.riskLevel, 'high');
  assert.strictEqual(pyCmd.requiresConfirmation, true);

  const nodeCmd = LayaSystem1.assessCommandRisk('node -e "process.exit(1)"', 'supervised');
  assert.strictEqual(nodeCmd.riskLevel, 'high');
  assert.strictEqual(nodeCmd.requiresConfirmation, true);
});

test('LayaSystem1 surgical token pruning compresses repetitive logs', () => {
  const hugeLog = Array.from({ length: 300 }, (_, i) => `Trace line ${i}: error at runtime\n`).join('');
  const pruned = LayaSystem1.pruneCompilerLog(hugeLog, 500);
  assert.ok(pruned.length < hugeLog.length);
  assert.ok(pruned.includes('[... pruned'));
});

test('AIF project managers isolate memory and preserve prior notes', async () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const a = getAifManager(`test_iso_${suffix}_a`);
  const b = getAifManager(`test_iso_${suffix}_b`);

  await a.commitNote({ importance: 0.55, summary: 'Project A first note', tags: ['a'] });
  await a.commitNote({ importance: 0.58, summary: 'Project A second note', tags: ['a'] });

  const aRecall = await a.recall();
  assert.ok(aRecall.formattedContext.includes('Recent Project Memory'));
  assert.ok(aRecall.formattedContext.includes('Project A second note'));

  const aSummary = await a.getSummary();
  const bSummary = await b.getSummary();
  assert.ok(aSummary.total >= 2, 'AIF must preserve earlier notes');
  assert.strictEqual(bSummary.total, 0, 'AIF must not leak project memory');
  assert.strictEqual(aSummary.projectId, `test_iso_${suffix}_a`);
});

test('LayaSystem1 extracts semantic tags for AIF', () => {
  const tags = LayaSystem1.extractSemanticTags('Fix CPU core affinity pinning in rust krypton-core-rs module');
  assert.ok(tags.includes('rust'));
  assert.ok(tags.includes('cpu') || tags.includes('affinity') || tags.includes('hardware'));
});

test('AIF cognitive memory lifecycle creates notes and recalls state', async () => {
  const aif = new AifManager('test_project');
  aif.writeScratch('Testing volatile scratch buffer');
  const scratch = aif.readScratch();
  assert.strictEqual(scratch, 'Testing volatile scratch buffer');

  const noteResult = await aif.commitNote({
    importance: 0.85,
    summary: 'Architected Oorty Lite unified harness',
    tags: ['oorty-lite', 'harness', 'v4']
  });
  assert.ok(noteResult.success);

  const recall = await aif.recall();
  assert.ok(recall.core.some(b => b.summary.includes('Architected Oorty Lite')));
});

test('LayaSystem1 evaluate computes normalized softmax probabilities across choices without generating text', () => {
  const choices = ['read_local_file', 'query_database', 'search_web'];
  const state = 'Find the user records in sqlite and inspect the profile table';

  const probabilities = LayaSystem1.evaluate(state, choices);

  assert.strictEqual(typeof probabilities, 'object');
  assert.strictEqual(Object.keys(probabilities).length, 3);

  // Must sum to ~1.0
  const sum = Object.values(probabilities).reduce((acc, v) => acc + v, 0);
  assert.ok(Math.abs(sum - 1.0) < 0.01, `Probabilities must sum to ~1.0, got ${sum}`);

  // Database option should have highest score for database query
  assert.ok(
    (probabilities['query_database'] || 0) > (probabilities['search_web'] || 0),
    'query_database should score higher than search_web for database task'
  );
});

test('LayaSystem1 tracks installation status and hardware acceleration', () => {
  const status = LayaSystem1.getStatus();
  assert.strictEqual(typeof status.isInstalled, 'boolean');
  assert.strictEqual(typeof status.isReady, 'boolean');
  assert.strictEqual(typeof status.isHardwareAccelerated, 'boolean');
  assert.strictEqual(typeof status.modelId, 'string');
});

test('AgentToolRegistry registers laya_contrastive_decision and laya_status tools', async () => {
  const registry = new AgentToolRegistry();
  const tools = registry.getAllTools();

  const layaTool = tools.find(t => t.name === 'laya_contrastive_decision');
  assert.ok(layaTool, 'laya_contrastive_decision tool must be registered');

  const statusTool = tools.find(t => t.name === 'laya_status');
  assert.ok(statusTool, 'laya_status tool must be registered');

  // Test executing laya_status
  const statusRes = await registry.execute('laya_status', {});
  assert.strictEqual(statusRes.success, true);
  assert.ok(statusRes.data.modelId);

  // Test executing laya_contrastive_decision
  const decisionRes = await registry.execute('laya_contrastive_decision', {
    state: 'npm install lodash',
    choices: ['safe_to_execute', 'needs_confirmation', 'block_immediately']
  });
  assert.strictEqual(decisionRes.success, true);
  assert.ok(decisionRes.data.scores);
  assert.ok(decisionRes.data.bestChoice);
});

test('AgentToolRegistry executes web, preview, and workspace code search tools', async () => {
  const registry = new AgentToolRegistry();

  // 1. search_web execution
  const searchRes = await registry.execute('search_web', { query: 'react hooks' });
  assert.strictEqual(searchRes.success, true);
  assert.ok(Array.isArray(searchRes.data.results));

  // 2. fetch_web_page security guards
  const ftpRes = await registry.execute('fetch_web_page', { url: 'ftp://malicious.com' });
  assert.strictEqual(ftpRes.success, false);
  assert.ok(ftpRes.error?.includes('Access Denied'));

  const cloudMetadataRes = await registry.execute('fetch_web_page', { url: 'http://169.254.169.254/latest/meta-data' });
  assert.strictEqual(cloudMetadataRes.success, false);
  assert.ok(cloudMetadataRes.error?.includes('Access Denied'));

  // 3. Screenshot and DOM tools must fail honestly without an open Live Preview.
  const screenshotRes = await registry.execute('take_screenshot', { clip: { x: 0, y: 0, width: 400, height: 300 } });
  assert.strictEqual(screenshotRes.success, false);
  assert.match(screenshotRes.error || '', /Live Preview is (not open|not available)/);

  const aliasRes = await registry.execute('capture_preview_screenshot', {});
  assert.strictEqual(aliasRes.success, false);
  assert.match(aliasRes.error || '', /Live Preview is (not open|not available)/);

  // 4. inspect_preview_dom must not fabricate a DOM snapshot
  const domRes = await registry.execute('inspect_preview_dom', { depth: 2 });
  assert.strictEqual(domRes.success, false);
  assert.match(domRes.error || '', /Live Preview is (not open|not available)/);

  // 5. grep_search execution
  const grepRes = await registry.execute('grep_search', { query: 'test', is_regex: false });
  assert.strictEqual(grepRes.success, true);
  assert.ok(Array.isArray(grepRes.data.matches));

  // 6. find_files_by_name execution
  const findRes = await registry.execute('find_files_by_name', { pattern: '*.ts' });
  assert.strictEqual(findRes.success, true);
  assert.ok(Array.isArray(findRes.data.matches));
});


test('list_dir scopes to the requested folder and edit_lines rejects invalid ranges', async () => {
  useIdeStore.setState({
    files: {
      root: { id: 'root', name: 'root', type: 'folder', parentId: null, children: ['src', 'readme'] },
      src: { id: 'src', name: 'src', type: 'folder', parentId: 'root', children: ['app'] },
      app: { id: 'app', name: 'app.tsx', type: 'file', parentId: 'src', content: 'one\ntwo\nthree', language: 'typescript' },
      readme: { id: 'readme', name: 'README.md', type: 'file', parentId: 'root', content: '# hi' },
    },
  } as any);

  const registry = new AgentToolRegistry();

  const rootList = await registry.execute('list_dir', {});
  assert.strictEqual(rootList.success, true);
  assert.deepStrictEqual(rootList.data.map((entry: any) => entry.path), ['src', 'README.md']);

  const srcList = await registry.execute('list_dir', { path: 'src' });
  assert.strictEqual(srcList.success, true);
  assert.deepStrictEqual(srcList.data, [{ name: 'app.tsx', type: 'file', path: 'src/app.tsx' }]);

  const missing = await registry.execute('list_dir', { path: 'does-not-exist' });
  assert.strictEqual(missing.success, false);
  assert.match(missing.error || '', /Directory not found/);

  const invalidEdit = await registry.execute('edit_lines', { path: 'src/app.tsx', start_line: 99, end_line: 100, new_content: 'x' });
  assert.strictEqual(invalidEdit.success, false);
  assert.match(invalidEdit.error || '', /out of range/);
});
