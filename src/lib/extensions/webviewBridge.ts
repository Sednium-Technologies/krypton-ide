export type WebviewAction =
  | { kind: 'openUrl'; url: string }
  | { kind: 'info'; text: string }
  | { kind: 'error'; text: string }
  | { kind: 'forward'; message: unknown };

export function routeWebviewMessage(message: any): WebviewAction[] {
  if (!message) return [];
  const command = message.command || message.type;
  if (!command) return [];

  if ((command === 'openUrl' || command === 'vscode:openUrl') && typeof message.url === 'string') {
    let url: URL;
    try {
      url = new URL(message.url);
    } catch {
      return [{ kind: 'error', text: 'Blocked unsafe URL from extension webview' }];
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'mailto:') {
      return [{ kind: 'error', text: 'Blocked unsafe URL from extension webview' }];
    }
    return [{ kind: 'openUrl', url: message.url }];
  }
  if ((command === 'showInformationMessage' || command === 'toast') && typeof message.text === 'string') {
    return [{ kind: 'info', text: message.text }];
  }
  if (command === 'showErrorMessage' && typeof message.text === 'string') {
    return [{ kind: 'error', text: message.text }];
  }
  return [{ kind: 'forward', message }];
}
