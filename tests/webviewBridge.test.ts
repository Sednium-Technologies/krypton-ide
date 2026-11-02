import test from 'node:test';
import assert from 'node:assert/strict';
import { routeWebviewMessage } from '../src/lib/extensions/webviewBridge';

test('routes only safe built-ins and forwards the rest', () => {
  assert.deepEqual(routeWebviewMessage({ command: 'openUrl', url: 'https://example.com' }), [
    { kind: 'openUrl', url: 'https://example.com' },
  ]);
  assert.deepEqual(routeWebviewMessage({ command: 'showInformationMessage', text: 'hi' }), [
    { kind: 'info', text: 'hi' },
  ]);
  assert.deepEqual(routeWebviewMessage({ command: 'openRules' }), [
    { kind: 'forward', message: { command: 'openRules' } },
  ]);
});

test('ignores empty messages', () => {
  assert.deepEqual(routeWebviewMessage(null), []);
  assert.deepEqual(routeWebviewMessage({}), []);
});
