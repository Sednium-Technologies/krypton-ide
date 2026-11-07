const vscode = require('vscode');

function activate(context) {
  vscode.window.showInformationMessage('Sample Cloud Extension Activated');

  const sbItem = vscode.window.createStatusBarItem(1, 100);
  sbItem.text = '$(cloud) Cloud Ready';
  sbItem.tooltip = 'Click to inspect cloud cluster status';
  sbItem.command = 'sample.cloudStatus';
  sbItem.show();

  const deployCmd = vscode.commands.registerCommand('sample.cloudDeploy', function (targetEnv) {
    const config = vscode.workspace.getConfiguration('sampleCloud');
    const region = config.get('region', 'us-east-1');
    return `Deployed to ${region} [${targetEnv || 'production'}]`;
  });

  const statusCmd = vscode.commands.registerCommand('sample.cloudStatus', function () {
    return { status: 'healthy', instances: 4 };
  });

  context.subscriptions.push(sbItem);
  context.subscriptions.push(deployCmd);
  context.subscriptions.push(statusCmd);
}

function deactivate() {
  vscode.window.showInformationMessage('Sample Cloud Extension Deactivated');
}

module.exports = {
  activate,
  deactivate
};
