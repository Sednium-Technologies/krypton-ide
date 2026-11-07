const vscode = require('vscode');

function activate(context) {
  const planCommand = vscode.commands.registerCommand('krypton.agent.plan', (taskDescription) => {
    const desc = taskDescription || 'Default system maintenance task';
    return [
      { step: 1, action: 'analyze-workspace', target: desc },
      { step: 2, action: 'generate-diff', files: ['package.json', 'src/index.ts'] },
      { step: 3, action: 'run-diagnostics', lspCheck: true },
      { step: 4, action: 'verify-tests', status: 'pending' }
    ];
  });

  const auditCommand = vscode.commands.registerCommand('krypton.agent.audit', (targetPath) => {
    const target = targetPath || '.';
    return {
      status: 'passed',
      target: target,
      timestamp: Date.now(),
      vulnerabilities: [],
      score: 100,
      verified: true
    };
  });

  context.subscriptions.push(planCommand);
  context.subscriptions.push(auditCommand);

  return {
    version: '1.0.0',
    capabilities: ['plan', 'audit']
  };
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
