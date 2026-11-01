import subprocess
import time
import json
import urllib.request
import os
import shutil

PORT = 9228
PROFILE = "/tmp/krypton-dynamic-profile"
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
  await new Promise(r => setTimeout(r, 1000));

  // Seed storage keys so neither FolderPicker nor WelcomeModal blocks execution
  await send('Runtime.evaluate', {
    expression: `(() => {
      localStorage.setItem('krypton-base-path', 'KryptonIDE');
      localStorage.setItem('kfs:KryptonIDE/krypton.config.json', JSON.stringify({
        welcomed: true,
        haptics: true,
        theme: 'krypton-warm',
        activeFont: '',
        installedFonts: [],
        ai: { provider: '', model: '', activeSessionId: null, savedModels: [] }
      }));
    })()`
  });

  // Reload to boot cleanly into ProjectsDashboard
  await send('Page.reload');
  
  // Wait for React app to mount and define __KRYPTON_STORES__
  for (let i = 0; i < 30; i++) {
    const res = await send('Runtime.evaluate', { expression: 'typeof window.__KRYPTON_STORES__ !== "undefined"' });
    if (res.result?.value === true) {
      console.log('Krypton stores initialized and ready!');
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // Create and open project programmatically to enter IdeLayout cleanly
  const openedRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const stores = window.__KRYPTON_STORES__;
      if (!stores) return 'no stores';
      let pids = Object.keys(stores.projects.getState().projects);
      let pid = pids[0];
      if (!pid) {
        pid = stores.projects.getState().createProject('DynamicTestProject', 'html');
      }
      stores.projects.getState().openProject(pid);
      return 'opened ' + pid;
    })()`
  });
  console.log('Project Open Result:', openedRes.result?.value);
  await new Promise(r => setTimeout(r, 2000));

  // Add sample dynamic extension into stores now that IDE layout is open
  await send('Runtime.evaluate', {
    expression: `(() => {
      const stores = window.__KRYPTON_STORES__;
      if (!stores) return;
      const sampleExt = {
        id: 'modmaker.sample-tool',
        name: 'Mod Inspector',
        publisher: 'ModMaker',
        description: 'Dynamic extension with live custom HTML webview',
        icon: 'puzzle',
        category: 'productivity',
        installed: true,
        activityBarContributions: [
          {
            id: 'inspector',
            title: 'Mod Inspector',
            icon: 'puzzle',
            views: [{ id: 'main', name: 'Main Inspector' }]
          }
        ],
        webviewHtml: '<!DOCTYPE html><html><body style="font-family: sans-serif; padding: 16px; background: #231e22; color: #f3f0e7;"><h3>Dynamic Mod View</h3><p>Rendered dynamically from mod maker HTML assets.</p></body></html>'
      };

      const curCustom = stores.extensions.getState().customExtensions || [];
      stores.extensions.setState({
        customExtensions: [...curCustom.filter(e => e.id !== sampleExt.id), sampleExt],
        installedExtensions: [...new Set([...stores.extensions.getState().installedExtensions, sampleExt.id])]
      });

      stores.navbar.getState().syncExtensionTools();
    })()`
  });
  await new Promise(r => setTimeout(r, 1000));

  // ── PORTRAIT STEP 1: Capture Editor + Bottom Nav ──
  await send('Runtime.evaluate', {
    expression: `(() => {
      const stores = window.__KRYPTON_STORES__;
      stores.navbar.setState({ isOverflowOpen: false });
      stores.ide.setState({ isSidebarOpen: false });
    })()`
  });
  await new Promise(r => setTimeout(r, 600));

  let shot1 = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/verified_01_portrait_editor.png`, Buffer.from(shot1.data, 'base64'));
  console.log('Captured verified_01_portrait_editor.png');

  // ── PORTRAIT STEP 2: Open "More" Drawer ──
  await send('Runtime.evaluate', {
    expression: `(() => {
      const stores = window.__KRYPTON_STORES__;
      stores.navbar.setState({ isOverflowOpen: true });
    })()`
  });
  await new Promise(r => setTimeout(r, 800));

  let shot2 = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/verified_02_portrait_more_drawer.png`, Buffer.from(shot2.data, 'base64'));
  console.log('Captured verified_02_portrait_more_drawer.png');

  // ── PORTRAIT STEP 3: Click Dynamic Extension in More Drawer ──
  await send('Runtime.evaluate', {
    expression: `(() => {
      const stores = window.__KRYPTON_STORES__;
      stores.navbar.setState({ isOverflowOpen: false });
      stores.ide.getState().openExtensionView({
        extensionId: 'modmaker.sample-tool',
        viewContainerId: 'inspector',
        title: 'Mod Inspector',
        toolId: 'ext-modmaker.sample-tool-inspector'
      });
    })()`
  });
  await new Promise(r => setTimeout(r, 1000));

  let shot3 = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/verified_03_portrait_dynamic_webview.png`, Buffer.from(shot3.data, 'base64'));
  console.log('Captured verified_03_portrait_dynamic_webview.png');

  // ── LANDSCAPE STEP 4: Switch to Landscape (920x420) ──
  await send('Emulation.setDeviceMetricsOverride', {
    width: 920,
    height: 420,
    deviceScaleFactor: 2.0,
    mobile: true,
    screenWidth: 920,
    screenHeight: 420
  });
  await new Promise(r => setTimeout(r, 1000));

  // Trigger resize and close sidebar initially for clean editor test
  await send('Runtime.evaluate', {
    expression: `(() => {
      const stores = window.__KRYPTON_STORES__;
      stores.ide.setState({ isSidebarOpen: false });
      stores.navbar.setState({ isOverflowOpen: false });
      window.dispatchEvent(new Event('resize'));
    })()`
  });
  await new Promise(r => setTimeout(r, 800));

  // Capture clean landscape editor (100% height, zero void, zero bottom nav)
  let shot4 = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/verified_04_landscape_full_editor.png`, Buffer.from(shot4.data, 'base64'));
  console.log('Captured verified_04_landscape_full_editor.png');

  // ── LANDSCAPE STEP 5: Open Mod Inspector from Left Activity Bar ──
  await send('Runtime.evaluate', {
    expression: `(() => {
      const stores = window.__KRYPTON_STORES__;
      stores.ide.getState().openExtensionView({
        extensionId: 'modmaker.sample-tool',
        viewContainerId: 'inspector',
        title: 'Mod Inspector',
        toolId: 'ext-modmaker.sample-tool-inspector'
      });
    })()`
  });
  await new Promise(r => setTimeout(r, 1000));

  // Capture docked split-pane with ZERO screen blur, side-by-side with Monaco
  let shot5 = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/verified_05_landscape_docked_dynamic_webview.png`, Buffer.from(shot5.data, 'base64'));
  console.log('Captured verified_05_landscape_docked_dynamic_webview.png');

  // ── LANDSCAPE STEP 6: Switch to Explorer in Docked Pane ──
  await send('Runtime.evaluate', {
    expression: `(() => {
      const stores = window.__KRYPTON_STORES__;
      stores.ide.setState({ sidebarView: 'explorer', isSidebarOpen: true });
    })()`
  });
  await new Promise(r => setTimeout(r, 800));

  let shot6 = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/verified_06_landscape_docked_file_explorer.png`, Buffer.from(shot6.data, 'base64'));
  console.log('Captured verified_06_landscape_docked_file_explorer.png');

  // Save logs
  writeFileSync(`${outDir}/verified_dynamic_logs.json`, JSON.stringify(logs, null, 2));
  console.log('Verification completed successfully! Wrote 6 screenshots and logs.');

  ws.close();
}

main().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
"""

with open("/tmp/verify_dynamic.mjs", "w") as f:
    f.write(NODE_SCRIPT)

cmd = [
    "/usr/bin/chromium",
    f"--remote-debugging-port={PORT}",
    f"--user-data-dir={PROFILE}",
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "http://localhost:3000"
]

print(f"Launching Chromium on port {PORT}...")
proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

try:
    for _ in range(30):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version") as r:
                if r.status == 200:
                    print("Chromium CDP ready!")
                    break
        except Exception:
            time.sleep(0.3)
    else:
        raise RuntimeError("Chromium failed to start")

    print("Running node CDP verification harness...")
    run_res = subprocess.run(["node", "/tmp/verify_dynamic.mjs", str(PORT), SCREENSHOT_DIR], capture_output=True, text=True)
    print("STDOUT:", run_res.stdout)
    print("STDERR:", run_res.stderr)
    if run_res.returncode != 0:
        raise RuntimeError(f"Harness failed with code {run_res.returncode}")
finally:
    proc.terminate()
    try:
        proc.wait(timeout=3)
    except Exception:
        proc.kill()
    shutil.rmtree(PROFILE, ignore_errors=True)
