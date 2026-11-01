import subprocess
import time
import json
import urllib.request
import os
import sys

PORT = 9225
PROFILE = "/tmp/krypton-cdp-profile"
SCREENSHOT_DIR = "/home/bhoid/.gemini/antigravity/brain/6850cb5e-26f8-4477-b77f-0b92001d9835/audit_screenshots"

os.makedirs(SCREENSHOT_DIR, exist_ok=True)

NODE_CLIENT = """
import { writeFileSync } from 'fs';

const cdpPort = process.argv[2];
const action = process.argv[3];
const arg1 = process.argv[4];

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
      logs.push(`[EXCEPTION] ${data.params.exceptionDetails?.text || ''} ${data.params.exceptionDetails?.exception?.description || ''}`);
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

  // Mobile Portrait Emulation (Pixel 7 / generic Android 412x915)
  await send('Emulation.setDeviceMetricsOverride', {
    width: 412,
    height: 915,
    deviceScaleFactor: 2.625,
    mobile: true,
    screenWidth: 412,
    screenHeight: 915
  });

  // Seed localStorage and mark welcomed = true directly
  await send('Page.navigate', { url: 'http://localhost:3000' });
  await new Promise(r => setTimeout(r, 1500));

  await send('Runtime.evaluate', {
    expression: `(() => {
      localStorage.setItem('krypton-base-path', 'KryptonIDE');
      localStorage.setItem('krypton-projects', JSON.stringify({
        'proj-test-1': {
          id: 'proj-test-1',
          name: 'Demo Project v4',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          template: 'react',
          files: {
            'root': { id: 'root', name: 'root', type: 'folder', children: ['file-1', 'file-2'] },
            'file-1': { id: 'file-1', name: 'App.tsx', type: 'file', parentId: 'root', language: 'typescript', content: '// Welcome to Kryptonide v4.0\\nexport default function App() {\\n  return <h1>Kryptonide v4</h1>;\\n}\\n' },
            'file-2': { id: 'file-2', name: 'index.html', type: 'file', parentId: 'root', language: 'html', content: '<!doctype html><html><body><div id=\"root\"></div></body></html>' }
          }
        }
      }));
      localStorage.setItem('krypton-config', JSON.stringify({
        welcomed: true,
        haptics: true,
        theme: 'krypton-warm',
        activeFont: '',
        installedFonts: [],
        ai: { provider: '', model: '', activeSessionId: null, savedModels: [] }
      }));
    })()`
  });

  // Reload page to reflect seeded welcomed = true
  await send('Page.navigate', { url: 'http://localhost:3000' });
  await new Promise(r => setTimeout(r, 2000));

  // If there is a "Skip for now" button, click it
  await send('Runtime.evaluate', {
    expression: `(() => {
      const skip = Array.from(document.querySelectorAll('button, a, span')).find(el => el.innerText && el.innerText.includes('Skip for now'));
      if (skip) skip.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 1000));

  // Capture projects dashboard
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${arg1}/10_dashboard_portrait.png`, Buffer.from(shot.data, 'base64'));

  // Open the project
  await send('Runtime.evaluate', {
    expression: `(() => {
      const projCard = Array.from(document.querySelectorAll('div, button')).find(el => el.innerText && el.innerText.includes('Demo Project v4'));
      if (projCard) projCard.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 2000));

  // Capture IDE main mobile portrait
  shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${arg1}/11_ide_portrait.png`, Buffer.from(shot.data, 'base64'));

  // Click the "More" button on bottom navbar to open More Tools drawer
  await send('Runtime.evaluate', {
    expression: `(() => {
      const moreBtn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText && b.innerText.includes('More')) || b.getAttribute('aria-label') === 'Open more tools');
      if (moreBtn) moreBtn.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 1500));

  // Capture More Tools drawer open state
  shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${arg1}/12_ide_more_open_portrait.png`, Buffer.from(shot.data, 'base64'));

  // Landscape mode
  await send('Emulation.setDeviceMetricsOverride', {
    width: 915,
    height: 412,
    deviceScaleFactor: 2.625,
    mobile: true,
    screenWidth: 915,
    screenHeight: 412
  });
  await new Promise(r => setTimeout(r, 1500));

  // Capture IDE in landscape
  shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${arg1}/13_ide_landscape.png`, Buffer.from(shot.data, 'base64'));

  // Save logs
  writeFileSync(`${arg1}/console_logs.json`, JSON.stringify(logs, null, 2));
  console.log(`Success: Captured full IDE portrait and landscape flow in ${arg1}`);
  ws.close();
}

main().catch(err => {
  console.error('Node error:', err);
  process.exit(1);
});
"""

with open("/tmp/cdp_runner.mjs", "w") as f:
    f.write(NODE_CLIENT)

import shutil
shutil.rmtree(PROFILE, ignore_errors=True)

chrome_cmd = [
    "chromium",
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    f"--user-data-dir={PROFILE}",
    f"--remote-debugging-port={PORT}",
    "about:blank"
]
proc = subprocess.Popen(chrome_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

for _ in range(20):
    time.sleep(0.3)
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version")
        break
    except Exception:
        pass

try:
    res = subprocess.run(["node", "/tmp/cdp_runner.mjs", str(PORT), "audit", SCREENSHOT_DIR], capture_output=True, text=True)
    print("STDOUT:", res.stdout)
    if res.stderr:
        print("STDERR:", res.stderr)
finally:
    proc.terminate()
