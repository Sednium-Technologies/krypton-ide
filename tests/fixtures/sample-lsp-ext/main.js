const vscode = require('vscode');
const { LanguageClient, TransportKind } = require('vscode-languageclient/node');

let client = null;

function activate(context) {
  const serverOptions = {
    command: 'typescript-language-server',
    args: ['--stdio'],
    transport: TransportKind.stdio
  };

  const clientOptions = {
    documentSelector: [{ scheme: 'file', language: 'typescript' }],
    synchronize: {
      configurationSection: 'typescript'
    }
  };

  client = new LanguageClient(
    'krypton-ts-lsp',
    'Krypton TypeScript Language Server',
    serverOptions,
    clientOptions
  );

  const startDisposable = client.start();
  if (startDisposable && typeof startDisposable.dispose === 'function') {
    context.subscriptions.push(startDisposable);
  }

  const restartCommand = vscode.commands.registerCommand('krypton.lsp.restart', async () => {
    if (client) {
      await client.stop();
      const restartDisposable = client.start();
      if (restartDisposable && typeof restartDisposable.dispose === 'function') {
        context.subscriptions.push(restartDisposable);
      }
      return { status: 'restarted', clientId: client.id };
    }
    return { status: 'not-initialized' };
  });

  context.subscriptions.push(restartCommand);

  return {
    getClient: () => client,
    status: 'running'
  };
}

function deactivate() {
  if (client) {
    return client.stop();
  }
}

module.exports = {
  activate,
  deactivate
};
