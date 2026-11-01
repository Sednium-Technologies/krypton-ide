import subprocess
import time
import json
import urllib.request
import os
import shutil

PORT = 9230
PROFILE = "/tmp/krypton-verify-cdp2"
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
    return null;
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Console.enable');

  // Mobile Portrait (Pixel 7 Android 412x915)
  await send('Emulation.setDeviceMetricsOverride', {
    width: 412,
    height: 915,
    deviceScaleFactor: 2.625,
    mobile: true,
    screenWidth: 412,
    screenHeight: 915
  });

  console.log('[CDP] Navigating to http://localhost:3000...');
  await send('Page.navigate', { url: 'http://localhost:3000' });

  // 1. Bypass Welcome Screen by clicking "Skip for now"
  console.log('[CDP] Waiting for initial welcome or permission screen...');
  await waitForCondition(`() => {
    const skip = Array.from(document.querySelectorAll('button, a, span')).find(el => el.innerText && el.innerText.includes('Skip for now'));
    if (skip) {
      skip.click();
      return 'Clicked Skip for now';
    }
    const grant = Array.from(document.querySelectorAll('button')).find(el => el.innerText && el.innerText.includes('Grant Access'));
    if (grant) {
      grant.click();
      return 'Clicked Grant Access';
    }
    return null;
  }`, 15000);

  // 2. Wait for Dashboard
  console.log('[CDP] Waiting for Dashboard...');
  await waitForCondition(`() => {
    const newBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && (b.innerText.trim() === 'New' || b.innerText.includes('Create Project')));
    return newBtn ? true : null;
  }`, 15000);
  await new Promise(r => setTimeout(r, 800));

  // 3. Open Create Project Modal
  console.log('[CDP] Opening Create Project Modal...');
  await evalExpr(`(() => {
    const newBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && (b.innerText.trim() === 'New' || b.innerText.includes('Create Project')));
    if (newBtn) newBtn.click();
  })()`);
  await new Promise(r => setTimeout(r, 1200));

  // CAPTURE 1: Verified Create Project Modal with fixed padding
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/verified_01_create_project_modal_padding.png`, Buffer.from(shot.data, 'base64'));
  console.log('Saved verified_01_create_project_modal_padding.png');

  // 4. Click "Create Project" button inside modal to enter IDE workspace
  console.log('[CDP] Creating project to enter IDE workspace...');
  await evalExpr(`(() => {
    const allButtons = Array.from(document.querySelectorAll('button'));
    const createBtn = allButtons.reverse().find(b => b.innerText && b.innerText.trim() === 'Create Project');
    if (createBtn) createBtn.click();
  })()`);

  // Wait for IDE workspace to load (bottom navbar presence)
  console.log('[CDP] Waiting for IDE workspace to load...');
  await waitForCondition(`() => {
    const nav = document.querySelector('.bottom-nav') || document.querySelector('[role="tablist"]');
    return nav ? true : null;
  }`, 15000);
  await new Promise(r => setTimeout(r, 2000));

  // CAPTURE 2: IDE Main Screen in Portrait
  shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/verified_01_ide_portrait.png`, Buffer.from(shot.data, 'base64'));
  console.log('Saved verified_01_ide_portrait.png');

  // 5. Click "More" on Bottom Navigation Bar
  console.log('[CDP] Opening More Tools drawer from bottom navbar...');
  await evalExpr(`(() => {
    const moreBtn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText && b.innerText.includes('More')) || b.getAttribute('aria-label') === 'Open more tools');
    if (moreBtn) moreBtn.click();
  })()`);
  await new Promise(r => setTimeout(r, 1200));

  // CAPTURE 3: More Tools Drawer Docked, Command Button in Header, Claude Code icon
  shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/verified_02_more_tools_drawer.png`, Buffer.from(shot.data, 'base64'));
  console.log('Saved verified_02_more_tools_drawer.png');

  // 6. Click Claude Code in More Tools Drawer
  console.log('[CDP] Clicking Claude Code extension tool...');
  await evalExpr(`(() => {
    const claudeBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Claude Code'));
    if (claudeBtn) claudeBtn.click();
  })()`);
  await new Promise(r => setTimeout(r, 1800));

  // CAPTURE 4: Dynamic Extension View Panel with Contributed Views and CLI Runtime Bridge
  shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/verified_03_claude_code_extension_window.png`, Buffer.from(shot.data, 'base64'));
  console.log('Saved verified_03_claude_code_extension_window.png');

  // 7. Verify Runtime / CLI Bridge
  console.log('[CDP] Testing Runtime / CLI bridge...');
  await evalExpr(`(() => {
    const termBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Launch in Terminal'));
    if (termBtn) termBtn.click();
  })()`);
  await new Promise(r => setTimeout(r, 1200));

  shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/verified_04_claude_interaction_and_apply.png`, Buffer.from(shot.data, 'base64'));
  console.log('Saved verified_04_claude_interaction_and_apply.png');

  // 8. Android Landscape Mode (915x412)
  console.log('[CDP] Emulating Android Landscape...');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 915,
    height: 412,
    deviceScaleFactor: 2.625,
    mobile: true,
    screenWidth: 915,
    screenHeight: 412
  });
  await new Promise(r => setTimeout(r, 1500));

  // CAPTURE 6: Android Landscape Layout
  shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/verified_06_android_landscape_mode.png`, Buffer.from(shot.data, 'base64'));
  console.log('Saved verified_06_android_landscape_mode.png');

  writeFileSync(`${outDir}/verified_console_logs.json`, JSON.stringify(logs, null, 2));
  console.log(`Saved ${logs.length} console logs.`);

  ws.close();
}

main().catch(err => {
  console.error('CDP Error:', err);
  process.exit(1);
});
"""

with open("/tmp/verify_cdp.mjs", "w") as f:
    f.write(NODE_CLIENT)

print("[1] Starting Chromium headless...")
proc = subprocess.Popen([
    "/usr/bin/chromium",
    "--headless=new",
    "--remote-debugging-port=" + str(PORT),
    "--user-data-dir=" + PROFILE,
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--window-size=412,915",
    "http://localhost:3000"
], stdout=subprocess.PIPE, stderr=subprocess.PIPE)

try:
    for i in range(60):
        time.sleep(0.5)
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version") as r:
                if r.status == 200:
                    print("[2] Chromium CDP endpoint live!")
                    break
        except:
            pass
    else:
        out, err = proc.communicate(timeout=2)
        print("Chromium STDOUT:", out.decode('utf-8', errors='ignore'))
        print("Chromium STDERR:", err.decode('utf-8', errors='ignore'))
        raise Exception("Chromium CDP failed to start")

    print("[3] Running full automated verification sequence...")
    res = subprocess.run(["node", "/tmp/verify_cdp.mjs", str(PORT), SCREENSHOT_DIR], capture_output=True, text=True)
    print(res.stdout)
    if res.stderr:
        print("STDERR:", res.stderr)

finally:
    proc.terminate()
    proc.wait()
    print("[4] Browser verification teardown complete.")
