import test from 'node:test';
import assert from 'node:assert/strict';
import { ExtensionHostWeb } from '../src/lib/extensions/nativeExtensionHost';

test('ExtensionHostWeb resolves, drains, and routes runtime webviews', async () => {
  const host = new ExtensionHostWeb();
  const received: any[] = [];

  host.registerMockWebview(
    {
      id: 'wv_1',
      extensionId: 'anthropic.claude-code',
      kind: 'view',
      viewType: 'claudeVSCodeSidebar',
      title: 'Claude Code',
      html: '<html><body>Runtime Claude</body></html>',
      visible: true,
      messages: [],
    },
    (message) => {
      received.push(message);
      host.pushMockWebviewMessage('wv_1', { type: 'host-reply', payload: message });
    }
  );

  const resolved = await host.resolveWebview({
    extensionId: 'anthropic.claude-code',
    viewId: 'claudeVSCodeSidebar',
  });
  assert.ok(resolved.webview);
  assert.equal(resolved.webview?.id, 'wv_1');
  assert.ok(resolved.webview?.html.includes('Runtime Claude'));

  const missing = await host.resolveWebview({
    extensionId: 'anthropic.claude-code',
    viewId: 'missing.view',
  });
  assert.equal(missing.webview, null);

  const handled = await host.sendWebviewMessage({
    webviewId: 'wv_1',
    messageJson: JSON.stringify({ type: 'ready' }),
  });
  assert.equal(handled.handled, true);
  assert.deepEqual(received, [{ type: 'ready' }]);

  const drained = await host.drainWebviews({ extensionId: 'anthropic.claude-code' });
  assert.equal(drained.webviews.length, 1);
  assert.deepEqual(drained.webviews[0].messages, [
    { type: 'host-reply', payload: { type: 'ready' } },
  ]);

  const afterDrain = await host.drainWebviews({ extensionId: 'anthropic.claude-code' });
  assert.deepEqual(afterDrain.webviews[0].messages, []);

  const unhandled = await host.sendWebviewMessage({
    webviewId: 'wv_1',
    messageJson: '{not-json',
  });
  assert.equal(unhandled.handled, false);
});
