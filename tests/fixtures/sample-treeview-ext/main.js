const vscode = require('vscode');

let refreshCount = 0;

function activate(context) {
  const refreshCommand = vscode.commands.registerCommand('krypton.sample.refresh', () => {
    refreshCount++;
    return {
      refreshed: true,
      count: refreshCount,
      timestamp: Date.now()
    };
  });

  context.subscriptions.push(refreshCommand);

  return {
    getRefreshCount: () => refreshCount
  };
}

function deactivate() {
  refreshCount = 0;
}

module.exports = {
  activate,
  deactivate
};
