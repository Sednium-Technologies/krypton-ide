import subprocess
import time
import json
import urllib.request
import os
import shutil

PORT = 9225
PROFILE = "/tmp/krypton-capture-profile"
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

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Console.enable');

  // Mobile Portrait Emulation (Pixel 7 Android 412x915)
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

  // Handle storage consent / folder setup if present
  await send('Runtime.evaluate', {
    expression: `(() => {
      const consentBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('I Understand, Grant Access'));
      if (consentBtn) consentBtn.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 1000));

  // Seed storage so IDE loads directly
  await send('Runtime.evaluate', {
    expression: `(() => {
      localStorage.setItem('krypton-base-path', 'KryptonIDE');
      localStorage.setItem('krypton-config', JSON.stringify({ welcomed: true, haptics: true, theme: 'krypton-warm' }));
    })()`
  });

  // If Skip for now is present, click it
  await send('Runtime.evaluate', {
    expression: `(() => {
      const skip = Array.from(document.querySelectorAll('button, a, span')).find(el => el.innerText && el.innerText.includes('Skip for now'));
      if (skip) skip.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 1000));

  // Click Create Project button
  await send('Runtime.evaluate', {
    expression: `(() => {
      const createBtn = Array.from(document.querySelectorAll('button')).find(el => el.innerText && el.innerText.includes('Create Project'));
      if (createBtn) createBtn.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 1000));

  // Select HTML/JS template or scroll down to create
  await send('Runtime.evaluate', {
    expression: `(() => {
      const allButtons = Array.from(document.querySelectorAll('div[role="dialog"] button, button'));
      const createSubmit = allButtons.reverse().find(b => b.innerText && (b.innerText.trim() === 'Create' || b.innerText.includes('Create Project')));
      if (createSubmit) createSubmit.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 3500));

  // 1. Capture IDE main mobile portrait
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/verified_01_ide_portrait.png`, Buffer.from(shot.data, 'base64'));

  // 2. Click "More" button on bottom navbar
  const moreRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const moreBtn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText && b.innerText.includes('More')) || b.getAttribute('aria-label') === 'Open more tools');
      if (moreBtn) {
        moreBtn.click();
        return 'Clicked More button';
      }
      return 'More button not found';
    })()`
  });
  console.log('More click result:', moreRes.result?.value);
  await new Promise(r => setTimeout(r, 1500));

  // 2. Capture docked More Tools drawer
  shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/verified_02_ide_more_docked.png`, Buffer.from(shot.data, 'base64'));

  // 3. Click the Command Palette (⌘) button inside the More Tools drawer header
  const cmdRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const cmdBtn = document.querySelector('button[title*="Command Palette"]') || document.querySelector('button[aria-label="Open command palette"]');
      if (cmdBtn) {
        cmdBtn.click();
        return 'Clicked Command Palette button in More drawer header';
      }
      return 'Command button not found in header';
    })()`
  });
  console.log('Command button result:', cmdRes.result?.value);
  await new Promise(r => setTimeout(r, 1200));

  // 3. Capture Command Palette opened from More window
  shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/verified_03_command_palette_open.png`, Buffer.from(shot.data, 'base64'));

  // Close command palette by pressing Escape
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await new Promise(r => setTimeout(r, 1000));

  // 4. Switch to Landscape Mode (915x412)
  await send('Emulation.setDeviceMetricsOverride', {
    width: 915,
    height: 412,
    deviceScaleFactor: 2.625,
    mobile: true,
    screenWidth: 915,
    screenHeight: 412
  });
  await new Promise(r => setTimeout(r, 1500));

  // 4. Capture IDE in mobile landscape
  shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${outDir}/verified_04_ide_landscape.png`, Buffer.from(shot.data, 'base64'));

  // 5. Save logs
  writeFileSync(`${outDir}/verified_console_logs.json`, JSON.stringify(logs, null, 2));
  console.log(`[+] Successfully captured verified UI screenshots in ${outDir}`);
  ws.close();
}

main().catch(err => {
  console.error('Capture error:', err);
  process.exit(1);
});
"""

with open("/tmp/capture_runner.mjs", "w") as f:
    f.write(NODE_CLIENT)

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

for _ in range(25):
    time.sleep(0.3)
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version")
        break
    except Exception:
        pass

try:
    res = subprocess.run(["node", "/tmp/capture_runner.mjs", str(PORT), SCREENSHOT_DIR], capture_output=True, text=True)
    print("STDOUT:", res.stdout)
    if res.stderr:
        print("STDERR:", res.stderr)
finally:
    proc.terminate()
