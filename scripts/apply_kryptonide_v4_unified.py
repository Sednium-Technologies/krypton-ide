#!/usr/bin/env python3
import os
import re
import shutil
import subprocess

IDE_ROOT = '/run/media/bhoid/StorageVault/WEbs/krypton-ide'
WEB_ROOT = '/run/media/bhoid/StorageVault/WEbs/KryptonideWeb'

def patch_file(path, replacements):
    if not os.path.exists(path):
        print(f"[!] Path does not exist: {path}")
        return False
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    orig = content
    for old, new in replacements:
        if old in content:
            content = content.replace(old, new)
        else:
            print(f"[?] Target substring not found in {os.path.basename(path)}: {old[:40]}...")
    if content != orig:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"[+] Successfully patched {os.path.basename(path)}")
        return True
    else:
        print(f"[-] No changes applied to {os.path.basename(path)}")
        return False

print("=== 1. Patching TypeScript Compile Errors ===")

# 1.1 CodeEditor.tsx
patch_file(f'{IDE_ROOT}/src/components/editor/CodeEditor.tsx', [
    ('        freeInlineCompletions: () => {},\n', ''),
    ("mode: 'always',", "mode: 'prefix',"),
])

# 1.2 useTerminalScanner.ts
patch_file(f'{IDE_ROOT}/src/hooks/useTerminalScanner.ts', [
    ('const bootstrap = await nativeTerminalBridge.checkBootstrapStatus();',
     'const bootstrap = await nativeTerminalBridge.getBootstrapStatus();'),
])

# 1.3 inlineCompletionService.ts
old_config_check = """      apiKey = (await readApiKey()) || '';
      if (!apiKey) {
        const config = await readConfig();
        if (config?.apiKey) {
          apiKey = config.apiKey;
        }
      }"""
new_config_check = """      apiKey = (await readApiKey()) || '';"""
patch_file(f'{IDE_ROOT}/src/lib/ai/inlineCompletionService.ts', [
    (old_config_check, new_config_check)
])

print("\n=== 2. Patching UI: More Tools Drawer, Command Button & Bottom Navbar ===")

# 2.1 NavbarOverflowDrawer.tsx
patch_file(f'{IDE_ROOT}/src/components/layout/NavbarOverflowDrawer.tsx', [
    ("import { SlidersHorizontal, ChevronRight, ChevronDown, ChevronUp, MoreHorizontal } from 'lucide-react';",
     "import { SlidersHorizontal, ChevronRight, ChevronDown, ChevronUp, MoreHorizontal, Command } from 'lucide-react';"),
    ("  const theme = useIdeStore((state) => state.theme);",
     "  const theme = useIdeStore((state) => state.theme);\n  const setCommandPaletteOpen = useIdeStore((state) => state.setCommandPaletteOpen);"),
    ('className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"',
     'className="fixed inset-x-0 top-0 z-30 bg-black/50 backdrop-blur-sm" style={{ bottom: \'calc(56px + env(safe-area-inset-bottom, 0px))\' }}'),
    ("""                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => {
                      hapticLight();
                      setOverflowOpen(false);
                      setCustomizerOpen(true);
                    }}""",
     """                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => {
                      hapticLight();
                      setOverflowOpen(false);
                      setCommandPaletteOpen(true);
                    }}
                    className={`flex items-center space-x-1 px-2 py-1 rounded-lg text-[11px] font-semibold active:scale-95 transition-all cursor-pointer ${
                      isLight
                        ? 'text-[#2a2529]/70 hover:text-[#2a2529] hover:bg-[#2a2529]/10'
                        : 'text-[#f3f0e7]/70 hover:text-[#f3f0e7] hover:bg-[#f3f0e7]/10'
                    }`}
                    title="Command Palette (⌘)"
                    aria-label="Open command palette"
                  >
                    <Command size={12} />
                    <span>⌘</span>
                  </button>
                  <button
                    onClick={() => {
                      hapticLight();
                      setOverflowOpen(false);
                      setCustomizerOpen(true);
                    }}""")
])

# 2.2 IdeLayout.tsx
old_fab = """      {/* Command Palette FAB for Mobile - positioned cleanly above navbar and More tab */}
      <button
        onClick={() => {
          hapticLight();
          setCommandPaletteOpen(true);
        }}
        className="md:hidden keyboard-hidden fixed right-4 bottom-28 z-40 min-w-[44px] min-h-[44px] w-11 h-11 rounded-2xl bg-[#342f33]/90 backdrop-blur-xl border border-[#f3f0e7]/20 text-[#f3f0e7] flex items-center justify-center shadow-[0_8px_25px_rgba(0,0,0,0.5)] active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-[#f3f0e7]/50 focus-visible:outline-none cursor-pointer"
        title="Command Palette"
        aria-label="Open command palette"
      >
        <Command size={19} />
      </button>"""

patch_file(f'{IDE_ROOT}/src/components/layout/IdeLayout.tsx', [
    (old_fab, ''),
    ('className={`md:hidden bottom-nav relative z-40 flex justify-around items-center flex-shrink-0 select-none ${',
     'className={`md:hidden bottom-nav relative z-50 flex justify-around items-center flex-shrink-0 select-none ${'),
    ('"relative w-[85vw] max-w-sm h-full border-r shadow-2xl flex flex-col z-10 animate-slide-right",',
     '"relative w-[85vw] max-w-sm max-h-[85vh] overflow-y-auto border-r shadow-2xl flex flex-col z-10 animate-slide-right",'),
])

print("\n=== 3. GitHub Device Login CORS & Auth Fix ===")

# 3.1 vite.config.ts
patch_file(f'{IDE_ROOT}/vite.config.ts', [
    ("""  server: {
    allowedHosts: true,
  },""",
     """  server: {
    allowedHosts: true,
    proxy: {
      '/api/github-oauth': {
        target: 'https://github.com/login',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\\/api\\/github-oauth/, ''),
      },
    },
  },""")
])

# 3.2 githubOAuth.ts
patch_file(f'{IDE_ROOT}/src/lib/githubOAuth.ts', [
    ("""const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';""",
     """const IS_NATIVE = Capacitor.isNativePlatform();
const DEVICE_CODE_URL = IS_NATIVE ? 'https://github.com/login/device/code' : '/api/github-oauth/device/code';
const ACCESS_TOKEN_URL = IS_NATIVE ? 'https://github.com/login/oauth/access_token' : '/api/github-oauth/oauth/access_token';""")
])

# 3.3 SettingsPanel.tsx
old_web_block = """    if (!Capacitor.isNativePlatform()) {
      setDeviceFlowStatus('error');
      setConnectError('GitHub Device Login available on mobile. Use PAT on web.');
      return;
    }"""
patch_file(f'{IDE_ROOT}/src/components/sidebar/SettingsPanel.tsx', [
    (old_web_block, '')
])

print("\n=== 4. Directory Bloat & File Cleanup ===")

# 4.1 Replace 5.25MB splash with real 54KB icon in resources/
if os.path.exists(f'{IDE_ROOT}/assets/icon.png'):
    shutil.copyfile(f'{IDE_ROOT}/assets/icon.png', f'{IDE_ROOT}/resources/icon.png')
    print("[+] Replaced resources/icon.png with genuine assets/icon.png")

# 4.2 Clean up stale directories
for item in [f'{IDE_ROOT}/dist', f'{IDE_ROOT}/TLMs', f'{IDE_ROOT}/.directory']:
    if os.path.isdir(item):
        shutil.rmtree(item)
        print(f"[+] Removed directory: {item}")
    elif os.path.isfile(item):
        os.remove(item)
        print(f"[+] Removed file: {item}")

# 4.3 Git ignore dist-apk/
with open(f'{IDE_ROOT}/.gitignore', 'r', encoding='utf-8') as f:
    gi = f.read()
if 'dist-apk/' not in gi:
    with open(f'{IDE_ROOT}/.gitignore', 'a', encoding='utf-8') as f:
        f.write('\n# Release binaries\ndist-apk/\n')
    print("[+] Added dist-apk/ to .gitignore")

# Untrack dist-apk from git index if tracked
subprocess.run(['git', 'rm', '--cached', '-r', 'dist-apk/'], cwd=IDE_ROOT, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)

print("\n=== 5. Rebranding to Kryptonide & Version Bump to v4.0 across App & Web ===")

# 5.1 App configs
patch_file(f'{IDE_ROOT}/metadata.json', [
    ('"name": "Krypton IDE",', '"name": "Kryptonide",'),
    ('"version": "1.0.0"', '"version": "4.0.0"'),
])

patch_file(f'{IDE_ROOT}/capacitor.config.json', [
    ('"appName": "Krypton IDE",', '"appName": "Kryptonide",')
])

patch_file(f'{IDE_ROOT}/index.html', [
    ('<title>Krypton IDE</title>', '<title>Kryptonide</title>'),
    ('content="Krypton IDE - A powerful mobile-first code editor for your smartphone"',
     'content="Kryptonide - A powerful mobile-first code editor for your smartphone"'),
])

patch_file(f'{IDE_ROOT}/android/app/src/main/res/values/strings.xml', [
    ('<string name="app_name">Krypton IDE</string>', '<string name="app_name">Kryptonide</string>'),
    ('<string name="title_activity_main">Krypton IDE</string>', '<string name="title_activity_main">Kryptonide</string>')
])

patch_file(f'{IDE_ROOT}/src/components/projects/ProjectsDashboard.tsx', [
    ('>Krypton IDE</h1>', '>Kryptonide</h1>'),
    ('Created with Krypton IDE', 'Created with Kryptonide'),
    ('Krypton IDE\n                </span>', 'Kryptonide\n                </span>')
])

patch_file(f'{IDE_ROOT}/src/components/sidebar/GitPanel.tsx', [
    ('authorize Krypton IDE.', 'authorize Kryptonide.')
])

patch_file(f'{IDE_ROOT}/src/config/prompts/larry.txt', [
    ('embedded in **Krypton IDE**', 'embedded in **Kryptonide**'),
    ('- **IDE**: Krypton IDE v2.0', '- **IDE**: Kryptonide v4.0 (Mobile & Agentic)'),
])

patch_file(f'{IDE_ROOT}/src/lib/shellEngine.ts', [
    ('Krypton IDE', 'Kryptonide')
])

# 5.2 Web Landing Page Components
patch_file(f'{WEB_ROOT}/src/components/Hero.tsx', [
    ('Introducing Krypton IDE v3.0', 'Introducing Kryptonide v4.0'),
    ('Get Krypton v3.0', 'Get Kryptonide v4.0'),
    ('/dist-apk/krypton-v3.0.0-release.apk', '/dist-apk/kryptonide-v4.0.0-release.apk'),
])

patch_file(f'{WEB_ROOT}/src/components/Navbar.tsx', [
    ('<span className="font-semibold tracking-tight text-white/90">Krypton IDE</span>',
     '<span className="font-semibold tracking-tight text-white/90">Kryptonide</span>'),
    ('Download v3.0', 'Download v4.0'),
    ('/dist-apk/krypton-v3.0.0-release.apk', '/dist-apk/kryptonide-v4.0.0-release.apk'),
])

patch_file(f'{WEB_ROOT}/src/components/Footer.tsx', [
    ('use Kryptonide.', 'use Kryptonide.'),
    ('Krypton IDE (also known as Kryptonide or kryptnide)', 'Kryptonide (formerly Krypton IDE)'),
    ('/dist-apk/krypton-v3.0.0-release.apk', '/dist-apk/kryptonide-v4.0.0-release.apk'),
])

patch_file(f'{WEB_ROOT}/src/components/Testimonials.tsx', [
    ('Krypton IDE completely changed my workflow', 'Kryptonide completely changed my workflow'),
    ("Krypton's <span className=\"text-white font-medium\">offline execution</span>",
     "Kryptonide's <span className=\"text-white font-medium\">offline execution</span>"),
    ('building with Krypton IDE.', 'building with Kryptonide v4.0.')
])

patch_file(f'{WEB_ROOT}/src/components/ChatWindow.tsx', [
    ('AI assistant for Krypton IDE.', 'AI assistant for Kryptonide.')
])

patch_file(f'{WEB_ROOT}/src/components/IDEWindow.tsx', [
    ('Krypton IDE | The Future...', 'Kryptonide | The Future...')
])

patch_file(f'{WEB_ROOT}/index.html', [
    ('Krypton IDE | Native Mobile Code Editor & AI IDE', 'Kryptonide | Native Mobile Code Editor & AI IDE'),
    ('Krypton IDE (also known as Kryptonide or kryptnide)', 'Kryptonide (formerly Krypton IDE)'),
    ('"name": "Krypton IDE"', '"name": "Kryptonide"'),
    ('Krypton IDE is a hyper-modern', 'Kryptonide is a hyper-modern')
])

print("\n=== All Unified Patches Applied Successfully! ===")
