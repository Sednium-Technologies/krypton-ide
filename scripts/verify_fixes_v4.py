import subprocess
import time
import json
import urllib.request
import os
import shutil

PORT = 9245
PROFILE = "/tmp/krypton-verify-v4"
SCREENSHOT_DIR = "/home/bhoid/.gemini/antigravity/brain/6850cb5e-26f8-4477-b77f-0b92001d9835/audit_screenshots"

os.makedirs(SCREENSHOT_DIR, exist_ok=True)
shutil.rmtree(PROFILE, ignore_errors=True)

NODE_CLIENT = """
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

  async function evalExpr(expression) {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true });
    return res.result?.value;
  }

  async function waitForCondition(checkFnString, timeoutMs = 15000, intervalMs = 300) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await evalExpr(`(${checkFnString})()`);
      if (res) return res;
      await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error(`Timeout waiting for condition: ${checkFnString}`);
  }

  async function takeScreenshot(name) {
    const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const buffer = Buffer.from(res.data, 'base64');
    const path = `${outDir}/${name}.png`;
    writeFileSync(path, buffer);
    console.log(`[+] Captured: ${path}`);
  }

  await send('Page.enable');
  await send('Runtime.enable');

  // 1. Mobile Portrait Viewport
  console.log('[*] Setting Mobile Portrait (412x915)...');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 412,
    height: 915,
    deviceScaleFactor: 2.625,
    mobile: true
  });

  console.log('[*] Navigating to http://localhost:3000 ...');
  await send('Page.navigate', { url: 'http://localhost:3000' });

  await waitForCondition(`() => document.querySelector('button') !== null`);
  await new Promise(r => setTimeout(r, 2000));

  // Enter default workspace if on dashboard
  await evalExpr(`(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const defProj = buttons.find(b => b.textContent && b.textContent.includes('Default Project'));
    if (defProj) defProj.click();
    else if (buttons[0]) buttons[0].click();
  })()`);

  await new Promise(r => setTimeout(r, 2500));

  // Open "More" tools drawer in portrait
  console.log('[*] Opening More Tools drawer in portrait...');
  await evalExpr(`(() => {
    const moreBtn = Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('aria-label') === 'Open more tools' || b.textContent.includes('More'));
    if (moreBtn) moreBtn.click();
  })()`);

  await new Promise(r => setTimeout(r, 1200));
  await takeScreenshot('fixed_01_more_drawer_seamless');

  // Close More drawer
  await evalExpr(`(() => {
    const backdrop = document.querySelector('div[style*="bottom: calc(56px"]');
    if (backdrop) backdrop.click();
  })()`);
  await new Promise(r => setTimeout(r, 800));

  // 2. Android Landscape Mode (915x412)
  console.log('[*] Switching to Android Landscape (915x412)...');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 915,
    height: 412,
    deviceScaleFactor: 2.0,
    mobile: true
  });
  await new Promise(r => setTimeout(r, 1500));

  // Open Explorer Sidebar in landscape
  console.log('[*] Opening Explorer sidebar in landscape...');
  await evalExpr(`(() => {
    const expTab = Array.from(document.querySelectorAll('button[role="tab"]')).find(b => b.getAttribute('aria-label') === 'Explorer');
    if (expTab) expTab.click();
  })()`);

  await new Promise(r => setTimeout(r, 1200));
  await takeScreenshot('fixed_02_landscape_deduplicated_docked');

  // 3. Open Extension View in Landscape
  console.log('[*] Opening Extension View in landscape...');
  await evalExpr(`(() => {
    // Switch to extension view
    const extTab = Array.from(document.querySelectorAll('button[role="tab"]')).find(b => b.getAttribute('aria-label') === 'Claude Code' || b.getAttribute('aria-label') === 'Extensions');
    if (extTab) extTab.click();
  })()`);

  await new Promise(r => setTimeout(r, 1500));
  await takeScreenshot('fixed_03_extension_view_inspector');

  writeFileSync(`${outDir}/fixed_console_logs.json`, JSON.stringify(logs, null, 2));
  console.log('[+] Verification flow finished successfully.');
  process.exit(0);
}

main().catch(err => {
  console.error('[!] Verification Error:', err);
  process.exit(1);
});
"""

with open("/tmp/krypton_verify_v4.mjs", "w") as f:
    f.write(NODE_CLIENT)

print("[*] Launching Chromium in headless mode...")
PORT = 9230

chrome_proc = subprocess.Popen([
    "/usr/bin/chromium",
    "--headless=new",
    f"--remote-debugging-port={PORT}",
    f"--user-data-dir={PROFILE}",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--disable-background-networking",
    "--window-size=412,915",
    "http://localhost:3000"
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

print("[*] Waiting for Chromium CDP to become ready...")
for i in range(25):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version", timeout=1) as resp:
            if resp.status == 200:
                print(f"[+] Chromium CDP is ready on port {PORT}!")
                break
    except Exception:
        time.sleep(0.5)
else:
    raise Exception("Chromium failed to start on CDP port")

try:
    print("[*] Running verification client...")
    res = subprocess.run(["node", "/tmp/krypton_verify_v4.mjs", str(PORT), SCREENSHOT_DIR], capture_output=True, text=True)
    print("STDOUT:", res.stdout)
    print("STDERR:", res.stderr)
    if res.returncode != 0:
        raise Exception("Verification client failed")
finally:
    chrome_proc.terminate()
    try:
        chrome_proc.wait(timeout=3)
    except:
        chrome_proc.kill()
