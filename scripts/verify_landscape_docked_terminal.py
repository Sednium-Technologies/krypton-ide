import subprocess
import time
import json
import urllib.request
import os
import shutil

PORT = 9230
PROFILE = "/tmp/krypton-landscape-term-profile"
SCREENSHOT_DIR = "/home/bhoid/.gemini/antigravity/brain/6850cb5e-26f8-4477-b77f-0b92001d9835/audit_screenshots"

os.makedirs(SCREENSHOT_DIR, exist_ok=True)
shutil.rmtree(PROFILE, ignore_errors=True)

NODE_SCRIPT = r"""
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

  await send('Runtime.enable');
  await send('Page.enable');
  await send('DOM.enable');

  async function evaluate(expression) {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) {
      throw new Error(`Eval failed: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }

  async function screenshot(name) {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(data, 'base64');
    const path = `${outDir}/${name}.png`;
    writeFileSync(path, buffer);
    console.log(`Saved screenshot: ${path}`);
  }

  async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  console.log('Navigating to http://localhost:3000...');
  await send('Page.navigate', { url: 'http://localhost:3000' });
  await sleep(1500);

  // Set landscape viewport
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1100,
    height: 650,
    deviceScaleFactor: 2,
    mobile: false
  });
  await sleep(500);

  // Initialize storage
  await evaluate(`
    (() => {
      localStorage.setItem('krypton-base-path', 'KryptonIDE');
      localStorage.setItem('kfs:KryptonIDE/krypton.config.json', JSON.stringify({
        welcomed: true,
        haptics: true,
        theme: 'krypton-warm',
        activeFont: '',
        installedFonts: [],
        ai: { provider: '', model: '', activeSessionId: null, savedModels: [] }
      }));
    })()
  `);
  await send('Page.reload');

  // Wait for stores to be ready
  for (let i = 0; i < 30; i++) {
    const res = await send('Runtime.evaluate', { expression: 'typeof window.__KRYPTON_STORES__ !== "undefined"' });
    if (res.result?.value === true) {
      console.log('Krypton stores initialized and ready!');
      break;
    }
    await sleep(400);
  }

  // 1. Open a project
  console.log('Opening project in store...');
  await evaluate(`
    (() => {
      const stores = window.__KRYPTON_STORES__;
      const pid = stores.projects.getState().createProject('Rust System App', 'rust-cli');
      stores.projects.getState().openProject(pid);
    })()
  `);
  await sleep(2000);

  // 2. Open the terminal
  console.log('Toggling terminal open...');
  await evaluate(`
    (() => {
      const stores = window.__KRYPTON_STORES__;
      stores.ide.getState().setIsTerminalOpen(true);
    })()
  `);
  await sleep(1500);

  // Check layout dimensions
  const layoutMetrics = await evaluate(`
    (() => {
      const aside = document.querySelector('aside');
      const editorArea = document.querySelector('.monaco-editor');
      const dragDivider = document.querySelector('div[title*="Drag to resize terminal"]');
      const topSwipeBar = document.querySelector('div[title*="Swipe down to dismiss"]');
      return {
        asideFound: !!aside,
        asideWidth: aside ? aside.getBoundingClientRect().width : 0,
        asideHeight: aside ? aside.getBoundingClientRect().height : 0,
        monacoFound: !!editorArea,
        monacoHeight: editorArea ? editorArea.getBoundingClientRect().height : 0,
        dividerFound: !!dragDivider,
        topSwipeBarHidden: !topSwipeBar
      };
    })()
  `);
  console.log('Landscape Layout Metrics:', layoutMetrics);

  await screenshot('verified_landscape_01_right_docked_terminal');

  // 3. Test terminal run command
  console.log('Triggering cargo run from quick chips...');
  await evaluate(`
    (() => {
      const runBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('cargo run'));
      if (runBtn) runBtn.click();
    })()
  `);
  await sleep(1800);

  await screenshot('verified_landscape_02_cargo_running');

  // 4. Test portrait mode
  console.log('Switching to portrait mode (400x800)...');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 400,
    height: 800,
    deviceScaleFactor: 2,
    mobile: true
  });
  await sleep(1500);

  const portraitMetrics = await evaluate(`
    (() => {
      const topSwipeBar = document.querySelector('div[title*="Swipe down to dismiss"]');
      const bottomPanel = document.querySelector('div[role="tablist"]');
      return {
        topSwipeBarVisible: !!topSwipeBar,
        bottomPanelFound: !!bottomPanel
      };
    })()
  `);
  console.log('Portrait Layout Metrics:', portraitMetrics);

  await screenshot('verified_portrait_03_bottom_docked_terminal');

  writeFileSync(`${outDir}/verified_landscape_term_logs.json`, JSON.stringify(logs, null, 2));
  console.log('All tests and screenshots completed successfully!');
  ws.close();
}

main().catch(err => {
  console.error('Fatal in test script:', err);
  process.exit(1);
});
"""

with open("/tmp/run_landscape_verify.mjs", "w") as f:
    f.write(NODE_SCRIPT)

chrome_proc = subprocess.Popen([
    "google-chrome-stable",
    f"--remote-debugging-port={PORT}",
    f"--user-data-dir={PROFILE}",
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--window-size=1100,650",
    "about:blank"
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

try:
    for _ in range(30):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version") as r:
                if r.status == 200:
                    break
        except Exception:
            time.sleep(0.2)
    else:
        raise RuntimeError("Chrome CDP did not become ready in time")

    res = subprocess.run(["node", "/tmp/run_landscape_verify.mjs", str(PORT), SCREENSHOT_DIR], capture_output=True, text=True)
    print("STDOUT:", res.stdout)
    print("STDERR:", res.stderr)
    if res.returncode != 0:
        raise RuntimeError(f"Node script exited with {res.returncode}")
finally:
    chrome_proc.terminate()
    try:
        chrome_proc.wait(timeout=3)
    except Exception:
        chrome_proc.kill()
