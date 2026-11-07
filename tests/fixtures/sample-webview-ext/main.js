const vscode = require('vscode');

function activate(context) {
  const openWebview = vscode.commands.registerCommand('krypton.webview.open', (options) => {
    const opts = options || {};
    const title = opts.title || 'Sample Panel';
    const viewType = opts.viewType || 'krypton.sampleWebview';

    const panel = {
      viewType: viewType,
      title: title,
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: sans-serif; background: #1e1e1e; color: #fff; padding: 16px; }
    h1 { color: #00ffcc; font-size: 1.2rem; }
    button { background: #007acc; color: white; border: none; padding: 6px 12px; cursor: pointer; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p id="counter">Messages: 0</p>
  <button onclick="sendPing()">Send Ping</button>
  <script>
    const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
    function sendPing() {
      if (vscode) vscode.postMessage({ command: 'ping', timestamp: Date.now() });
    }
  </script>
</body>
</html>`,
      active: true,
      visible: true
    };

    return panel;
  });

  context.subscriptions.push(openWebview);

  return {
    isWebviewRegistered: true
  };
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
