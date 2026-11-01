import subprocess
import time
import json
import urllib.request
import os
import shutil

PORT = 9229
PROFILE = "/tmp/krypton-rust-profile"
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
    width: 1024,
    height: 700,
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

  // 1. Create and open a Rust CLI project using window.__KRYPTON_STORES__
  console.log('Creating Rust CLI project in store...');
  const openRes = await evaluate(`
    (() => {
      const stores = window.__KRYPTON_STORES__;
      if (!stores) return 'no stores';
      const pid = stores.projects.getState().createProject('Rust Demo App', 'rust-cli');
      stores.projects.getState().openProject(pid);
      return 'opened ' + pid;
    })()
  `);
  console.log('Project Open Result:', openRes);
  await sleep(2500);

  // Click on the Run button in TopBar
  console.log('Clicking Run button...');
  await evaluate(`
    (() => {
      const runBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Run') && b.querySelector('svg'));
      if (runBtn) {
        runBtn.click();
        return true;
      }
      return false;
    })()
  `);
  await sleep(2500);

  await screenshot('verified_rust_01_cargo_run');

  // 2. Click the 'test' action chip in the terminal toolbar
  console.log('Clicking cargo test action chip...');
  const testRes = await evaluate(`
    (() => {
      const testBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.trim() === 'test');
      if (testBtn) {
        testBtn.click();
        return 'test button clicked';
      }
      return 'test button not found';
    })()
  `);
  console.log('Test Button Result:', testRes);
  await sleep(2000);

  const termBuffer = await evaluate(`
    (() => {
      const stores = window.__KRYPTON_STORES__;
      return window.__krypton_term_buffer || (stores ? stores.projects : 'no buffer');
    })()
  `);
  console.log('Terminal state:', termBuffer);

  await screenshot('verified_rust_02_cargo_test');

  // 3. Open Termux Bootstrap Modal to check interactive + Install button
  console.log('Opening Termux Bootstrap Modal...');
  await evaluate(`
    (() => {
      const cpuBtn = document.querySelector('button[title*="Termux Subsystem"]') || document.querySelector('button[title*="Install Full Termux"]');
      if (cpuBtn) {
        cpuBtn.click();
        return true;
      }
      return false;
    })()
  `);
  await sleep(1000);

  await screenshot('verified_rust_03_toolchain_modal');

  writeFileSync(`${outDir}/verified_rust_logs.json`, JSON.stringify(logs, null, 2));
  console.log('Verification completed successfully!');
  ws.close();
}

main().catch(err => {
  console.error('Fatal in test script:', err);
  process.exit(1);
});
"""

with open("/tmp/run_rust_verify.mjs", "w") as f:
    f.write(NODE_SCRIPT)

chrome_proc = subprocess.Popen([
    "google-chrome-stable",
    f"--remote-debugging-port={PORT}",
    f"--user-data-dir={PROFILE}",
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--window-size=1024,700",
    "about:blank"
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

try:
    # Wait for CDP
    for _ in range(30):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version") as r:
                if r.status == 200:
                    break
        except Exception:
            time.sleep(0.2)
    else:
        raise RuntimeError("Chrome CDP did not become ready in time")

    res = subprocess.run(["node", "/tmp/run_rust_verify.mjs", str(PORT), SCREENSHOT_DIR], capture_output=True, text=True)
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
