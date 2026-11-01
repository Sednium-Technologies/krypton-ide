import subprocess
import time

NODE_SCRIPT = """
import { writeFileSync } from 'fs';

async function main() {
  const versionRes = await fetch('http://127.0.0.1:9225/json/list');
  const targets = await versionRes.json();
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  let id = 1;
  const pending = new Map();

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  };

  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  function send(method, params = {}) {
    const curId = id++;
    return new Promise((resolve, reject) => {
      pending.set(curId, { resolve, reject });
      ws.send(JSON.stringify({ id: curId, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Console.enable');

  await send('Emulation.setDeviceMetricsOverride', {
    width: 412,
    height: 915,
    deviceScaleFactor: 2.625,
    mobile: true,
    screenWidth: 412,
    screenHeight: 915
  });

  await send('Page.navigate', { url: 'http://localhost:3000' });
  await new Promise(r => setTimeout(r, 1500));

  await send('Runtime.evaluate', {
    expression: `
      localStorage.setItem('krypton-base-path', 'KryptonIDE');
      localStorage.setItem('krypton-extensions', JSON.stringify({
        installedExtensions: ['anthropic.claude-code'],
        customExtensions: [{
          id: 'anthropic.claude-code',
          name: 'Claude Code for VS Code',
          publisher: 'Anthropic',
          description: 'Claude Code assistant for Kryptonide',
          icon: 'https://open-vsx.org/api/Anthropic/claude-code/alpine-arm64/2.1.270/file/claude-logo.png',
          category: 'productivity',
          installed: true,
          version: '2.1.270',
          activityBarContributions: [{
            id: 'claude',
            title: 'Claude Code',
            views: [{ id: 'claude.chat', name: 'Claude Assistant' }]
          }]
        }]
      }));
      localStorage.setItem('krypton-config', JSON.stringify({ welcomed: true, haptics: true, theme: 'krypton-warm' }));
    `
  });

  await send('Page.navigate', { url: 'http://localhost:3000' });
  await new Promise(r => setTimeout(r, 2000));

  // Dismiss welcome & open create modal
  await send('Runtime.evaluate', {
    expression: `
      const skip = Array.from(document.querySelectorAll('button, a, span')).find(el => el.innerText && el.innerText.includes('Skip for now'));
      if (skip) skip.click();
      const btn = Array.from(document.querySelectorAll('button')).find(el => el.innerText && el.innerText.includes('Create Project'));
      if (btn) btn.click();
    `
  });
  await new Promise(r => setTimeout(r, 1200));

  // Click the submit button inside modal (the bottom Create Project button)
  const submitRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const allButtons = Array.from(document.querySelectorAll('div[role="dialog"] button, button'));
      const createSubmit = allButtons.reverse().find(b => b.innerText && (b.innerText.trim() === 'Create' || b.innerText.includes('Create Project')));
      if (createSubmit) {
        createSubmit.scrollIntoView();
        createSubmit.click();
        return 'Clicked Create Submit';
      }
      return 'Submit button not found';
    })()`
  });
  console.log('Submit Result:', submitRes.result?.value);
  await new Promise(r => setTimeout(r, 3500));

  // Screenshot of IDE workspace
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('/home/bhoid/.gemini/antigravity/brain/6850cb5e-26f8-4477-b77f-0b92001d9835/audit_screenshots/test_ide_workspace.png', Buffer.from(shot.data, 'base64'));

  // Click More button on bottom navbar
  const moreRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const moreBtn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText && b.innerText.includes('More')) || b.getAttribute('aria-label') === 'Open more tools');
      if (moreBtn) {
        moreBtn.click();
        return 'Clicked More';
      }
      return 'More button not found. Active buttons: ' + Array.from(document.querySelectorAll('button')).map(b => b.innerText || b.getAttribute('aria-label') || b.title).filter(Boolean).join(' | ');
    })()`
  });
  console.log('More Result:', moreRes.result?.value);
  await new Promise(r => setTimeout(r, 1500));

  shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('/home/bhoid/.gemini/antigravity/brain/6850cb5e-26f8-4477-b77f-0b92001d9835/audit_screenshots/test_more_drawer_active.png', Buffer.from(shot.data, 'base64'));

  // Click Claude Code tool inside drawer
  const claudeRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const claudeTool = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Claude Code'));
      if (claudeTool) {
        claudeTool.click();
        return 'Clicked Claude Code tool';
      }
      return 'Claude Code tool not found. Tools in drawer: ' + Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean).join(' | ');
    })()`
  });
  console.log('Claude Click Result:', claudeRes.result?.value);
  await new Promise(r => setTimeout(r, 2000));

  shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('/home/bhoid/.gemini/antigravity/brain/6850cb5e-26f8-4477-b77f-0b92001d9835/audit_screenshots/test_claude_panel_open.png', Buffer.from(shot.data, 'base64'));

  console.log('Finished testing Claude Code in app');
  ws.close();
}

main().catch(err => {
  console.error('Claude Test error:', err);
  process.exit(1);
});
"""

with open('/tmp/test_claude.mjs', 'w') as f:
    f.write(NODE_SCRIPT)

chrome = subprocess.Popen([
    'chromium',
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--remote-debugging-port=9225',
    '--user-data-dir=/tmp/krypton-claude-test',
    'about:blank'
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(2)

try:
    res = subprocess.run(['node', '/tmp/test_claude.mjs'], capture_output=True, text=True)
    print('STDOUT:', res.stdout)
    if res.stderr:
        print('STDERR:', res.stderr)
finally:
    chrome.terminate()
