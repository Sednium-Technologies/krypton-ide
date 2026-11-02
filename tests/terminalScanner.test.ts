import test from 'node:test';
import assert from 'node:assert/strict';
import { scanToolsForEnvironment } from '../src/lib/terminal/toolScanner';

test('web preview never reports tools as installed', () => {
  const tools = scanToolsForEnvironment({ isNative: false, exists: () => false });
  assert.equal(tools.every((t) => t.isInstalled === false), true);
  assert.equal(tools.every((t) => t.reason === 'web-preview'), true);
});

test('native reports only tools whose binary exists', () => {
  const tools = scanToolsForEnvironment({
    isNative: true,
    exists: (path: string) => path.endsWith('/node'),
  });
  assert.equal(tools.find((t) => t.binary === 'node')?.isInstalled, true);
  assert.equal(tools.find((t) => t.binary === 'python3')?.isInstalled, false);
});
