const vscode = require('vscode');

function activate(context) {
  vscode.window.showInformationMessage('Sample Command Extension Activated');

  const helloCmd = vscode.commands.registerCommand('sample.hello', function (name) {
    return 'Hello ' + (name || 'World');
  });

  const computeCmd = vscode.commands.registerCommand('sample.compute', function (a, b) {
    return (Number(a) || 0) + (Number(b) || 0);
  });

  context.subscriptions.push(helloCmd);
  context.subscriptions.push(computeCmd);
}

function deactivate() {
  vscode.window.showInformationMessage('Sample Command Extension Deactivated');
}

module.exports = {
  activate,
  deactivate
};
