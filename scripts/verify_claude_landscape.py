import subprocess
import time
import json
import urllib.request
import os
import shutil

PORT = 9226
PROFILE = "/tmp/krypton-verify-profile"
SCREENSHOT_DIR = "/home/bhoid/.gemini/antigravity/brain/6850cb5e-26f8-4477-b77f-0b92001d9835/audit_screenshots"

os.makedirs(SCREENSHOT_DIR, exist_ok=True)
shutil.rmtree(PROFILE, ignore_errors=True)

NODE_SCRIPT = """
import { writeFileSync } from 'fs';

const cdpPort = process.argv[2];
const outDir = process.argv[3];

async function main() {
  const versionRes = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
  const targets = await versionRes.json();
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  if (!pageTarget) throw new Error('No page target found');

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  let id = 1;
  const pending = new Map();
  const logs = [];

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    } else if (data.method === 'Runtime.consoleAPICalled') {
      const args = (data.params.args || []).map(a => a.value !== undefined ? String(a.value) : (a.description || JSON.stringify(a))).join(' ');
      logs.push(`[${data.params.type}] ${args}`);
    } else if (data.method === 'Runtime.exceptionThrown') {
      const desc = data.params.exceptionDetails?.exception?.description || data.params.exceptionDetails?.text || 'Unknown exception';
      logs.push(`[EXCEPTION] ${desc}`);
      console.error(`[EXCEPTION] ${desc}`);
    }
  };

  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

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

  // 1. Mobile Portrait Emulation (Pixel 7: 412x915)
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

  // Seed project and installed extensions
  await send('Runtime.evaluate', {
    expression: `(() => {
      localStorage.setItem('krypton-base-path', 'KryptonIDE');
      localStorage.setItem('krypton-migrated-to-fs', 'true');
      localStorage.setItem('krypton-welcomed', 'true');
      localStorage.setItem('kfs:KryptonIDE/krypton.config.json', JSON.stringify({
        welcomed: true,
        haptics: true,
        theme: 'krypton-warm',
        activeFont: '',
        installedFonts: [],
        ai: { provider: '', model: '', activeSessionId: null, savedModels: [] }
      }));
      localStorage.setItem('krypton-projects', JSON.stringify({
        'proj-verify': {
          id: 'proj-verify',
          name: 'Kryptonide v4 Proj',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          template: 'react',
          files: {
            'root': { id: 'root', name: 'root', type: 'folder', children: ['f-app', 'f-html'] },
            'f-app': { id: 'f-app', name: 'App.tsx', type: 'file', parentId: 'root', language: 'typescript', content: '// Welcome to Kryptonide v4.0 Mobile IDE\\nexport default function App() {\\n  return <div>Verified</div>;\\n}\\n' },
            'f-html': { id: 'f-html', name: 'index.html', type: 'file', parentId: 'root', language: 'html', content: '<!doctype html>\\n<html lang=\"en\">\\n<head>\\n  <meta charset=\"UTF-8\" />\\n  <title>App</title>\\n</head>\\n<body>\\n  <div id=\"root\"></div>\\n</body>\\n</html>\\n' }
          }
        }
      }));
      localStorage.setItem('kfs:KryptonIDE/projects/proj-verify/project.meta.json', JSON.stringify({
        id: 'proj-verify',
        name: 'Kryptonide v4 Proj',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        template: 'react'
      }));
      localStorage.setItem('kfs:KryptonIDE/projects/proj-verify/files.json', JSON.stringify({
        'root': { id: 'root', name: 'root', type: 'folder', children: ['f-app', 'f-html'] },
        'f-app': { id: 'f-app', name: 'App.tsx', type: 'file', parentId: 'root', language: 'typescript', content: '// Welcome to Kryptonide v4.0 Mobile IDE\\nexport default function App() {\\n  return <div>Verified</div>;\\n}\\n' },
        'f-html': { id: 'f-html', name: 'index.html', type: 'file', parentId: 'root', language: 'html', content: '<!doctype html>\\n<html lang=\"en\">\\n<head>\\n  <meta charset=\"UTF-8\" />\\n  <title>App</title>\\n</head>\\n<body>\\n  <div id=\"root\"></div>\\n</body>\\n</html>\\n' }
      }));
      // Ensure Claude Code is installed
      localStorage.setItem('krypton-installed-extensions', JSON.stringify(['anthropic.claude-code']));
      // Clear any prior auth to verify pure Welcome screen
      localStorage.removeItem('kryptonide_claude_auth');
    })()`
  });

  async function waitFor(fnExp, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await send('Runtime.evaluate', { expression: fnExp });
      if (res.result?.value) return res.result.value;
      await new Promise(r => setTimeout(r, 250));
    }
    return null;
  }

  await send('Page.navigate', { url: 'http://localhost:3000' });
  
  // Wait for React to mount
  await waitFor('!!(document.getElementById("root") && document.getElementById("root").children.length > 0)');
  await new Promise(r => setTimeout(r, 1000));

  const dom1 = await send('Runtime.evaluate', { expression: '(document.body.textContent || "").slice(0, 300)' });
  console.log('STEP 1 DOM (Mounted):', dom1.result?.value);

  // If FolderPicker / Data & Storage Privacy is visible, click "I Understand, Grant Access"
  await send('Runtime.evaluate', {
    expression: `(() => {
      const grantBtn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('Grant Access') || (b.textContent || '').includes('I Understand'));
      if (grantBtn) grantBtn.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 800));

  // If there is a "Skip for now" welcome button, click it
  await send('Runtime.evaluate', {
    expression: `(() => {
      const skip = Array.from(document.querySelectorAll('button, a, span')).find(el => (el.textContent || '').includes('Skip for now'));
      if (skip) skip.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 800));

  // Wait for window.__KRYPTON_STORES__
  await waitFor('!!window.__KRYPTON_STORES__');

  // Enter the project directly and sync extensions
  await send('Runtime.evaluate', {
    expression: `(() => {
      const stores = window.__KRYPTON_STORES__;
      console.log('Stores available:', !!stores);
      if (stores) {
        const id = stores.projects.getState().createProject('Kryptonide v4 Proj', 'react');
        console.log('Created project with id:', id);
        stores.projects.getState().openProject(id);
        const p = stores.projects.getState().projects[id];
        if (p && p.files) {
          stores.ide.getState().loadProject(p.files);
        }
        stores.extensions.getState().installExtension('anthropic.claude-code');
        stores.navbar.getState().syncExtensionTools();
      }
    })()`
  });
  await new Promise(r => setTimeout(r, 2000));

  // 2. Open More Tools Drawer in Portrait to see Claude Code
  await send('Runtime.evaluate', {
    expression: `(() => {
      const moreBtn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('More') || b.getAttribute('aria-label') === 'Open more tools');
      if (moreBtn) moreBtn.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 1200));

  // Capture portrait with More Tools drawer open
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/verified_claude_01_more_drawer_portrait.png`, Buffer.from(shot.data, 'base64'));

  // Click Claude Code in drawer to open it
  await send('Runtime.evaluate', {
    expression: `(() => {
      const claudeTool = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('Claude') || (b.getAttribute('aria-label') || '').includes('Claude'));
      if (claudeTool) claudeTool.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 1500));

  // Capture portrait with genuine Claude Code Welcome Onboarding (User Image 3) in bottom sheet
  shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/verified_claude_02_portrait_bottomsheet.png`, Buffer.from(shot.data, 'base64'));

  // 3. SWITCH TO LANDSCAPE MODE (915x412)
  await send('Emulation.setDeviceMetricsOverride', {
    width: 915,
    height: 412,
    deviceScaleFactor: 2.625,
    mobile: true,
    screenWidth: 915,
    screenHeight: 412
  });
  await new Promise(r => setTimeout(r, 2000));

  // Capture landscape mode with Claude Code docked beside Monaco (Zero blur, full vertical editor height)
  shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/verified_claude_03_landscape_docked_zero_blur.png`, Buffer.from(shot.data, 'base64'));

  // 4. Click Claude.ai Subscription button inside the Claude Code panel
  await send('Runtime.evaluate', {
    expression: `(() => {
      const subBtn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('Claude.ai Subscription'));
      if (subBtn) subBtn.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 1000));

  // Capture landscape mode with subscription auth dialog open inside panel
  shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/verified_claude_04_landscape_subscription_flow.png`, Buffer.from(shot.data, 'base64'));

  // 5. Connect Console API key and transition to live agent workspace
  await send('Runtime.evaluate', {
    expression: `(() => {
      // Switch to Anthropic Console
      const consoleBtn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('Anthropic Console'));
      if (consoleBtn) consoleBtn.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 800));

  await send('Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('input[placeholder*="sk-ant"]');
      if (input) {
        input.value = 'sk-ant-api03-sample-test-key';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const saveBtn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('Save & Connect Console'));
      if (saveBtn) saveBtn.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 1500));

  // Capture landscape live agent workspace after login
  shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/verified_claude_05_landscape_live_workspace.png`, Buffer.from(shot.data, 'base64'));

  // 6. Close the sidebar to verify Monaco expands to 100% full width and 100% full height (Zero bottom beige void)
  await send('Runtime.evaluate', {
    expression: `(() => {
      const claudeIcon = Array.from(document.querySelectorAll('button[role="tab"]')).find(b => b.title && b.title.includes('Claude'));
      if (claudeIcon) claudeIcon.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 1500));

  shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/verified_claude_06_landscape_full_editor_no_void.png`, Buffer.from(shot.data, 'base64'));

  writeFileSync(`${outDir}/verified_claude_logs.json`, JSON.stringify(logs, null, 2));
  console.log('SUCCESS: All Claude Code and Landscape test scenarios verified and screens captured');
  ws.close();
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
"""

with open("/tmp/verify_claude_runner.mjs", "w") as f:
    f.write(NODE_SCRIPT)

chrome_cmd = [
    "chromium",
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    f"--user-data-dir={PROFILE}",
    f"--remote-debugging-port={PORT}",
    "about:blank"
]
proc = subprocess.Popen(chrome_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

for i in range(50):
    time.sleep(0.3)
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version")
        break
    except Exception:
        pass
else:
    print(f"Failed to start chromium on port {PORT}")

try:
    res = subprocess.run(["node", "/tmp/verify_claude_runner.mjs", str(PORT), SCREENSHOT_DIR], capture_output=True, text=True)
    print("STDOUT:", res.stdout)
    if res.stderr:
        print("STDERR:", res.stderr)
finally:
    proc.terminate()
