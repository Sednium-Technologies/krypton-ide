import { spawn } from 'child_process';

const chrome = spawn('/usr/bin/chromium', [
  '--headless=new',
  '--remote-debugging-port=9224',
  '--no-sandbox',
  '--disable-gpu',
  '--user-data-dir=/tmp/test-chromium-profile-2',
  'about:blank'
]);

async function check() {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9224/json/list');
      if (res.ok) {
        const tabs = await res.json();
        const tab = tabs[0];
        if (tab && tab.webSocketDebuggerUrl) {
          console.log('[CDP] Attached to blank tab');
          const ws = new WebSocket(tab.webSocketDebuggerUrl);
          ws.onopen = () => {
            ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
            ws.send(JSON.stringify({ id: 2, method: 'Log.enable' }));
            ws.send(JSON.stringify({ id: 3, method: 'Page.enable' }));
            setTimeout(() => {
              ws.send(JSON.stringify({ id: 4, method: 'Page.navigate', params: { url: 'http://127.0.0.1:4173' } }));
            }, 300);
          };
          ws.onmessage = (msg) => {
            const data = JSON.parse(msg.data.toString());
            if (data.method === 'Runtime.consoleAPICalled') {
              console.log('[BROWSER CONSOLE]', data.params.type, data.params.args.map(a => a.value ?? a.description ?? a));
            }
            if (data.method === 'Runtime.exceptionThrown') {
              console.error('[BROWSER EXCEPTION]', JSON.stringify(data.params.exceptionDetails, null, 2));
            }
          };
          setTimeout(() => {
            // Check DOM of root
            ws.send(JSON.stringify({
              id: 10,
              method: 'Runtime.evaluate',
              params: { expression: 'document.getElementById("root") ? document.getElementById("root").innerHTML.slice(0, 500) : "no root"' }
            }));
          }, 3000);

          setTimeout(() => {
            ws.close();
            chrome.kill();
            process.exit(0);
          }, 4500);
          return;
        }
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 300));
  }
  chrome.kill();
  process.exit(1);
}

check();
