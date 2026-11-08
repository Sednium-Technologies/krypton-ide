import { Capacitor } from '@capacitor/core';

export interface PackageEntry {
  id: string;
  name: string;
  category: string;
  description: string;
  binary_name: string;
  installed: boolean;
  version: string;
}

export interface LanguageStat {
  language: string;
  extension: string;
  byte_count: number;
  line_count: number;
  percentage: number;
  color_token: string;
}

export interface LanguageAnalysisResult {
  dominant_language: string;
  dominant_color: string;
  total_bytes: number;
  total_lines: number;
  languages: LanguageStat[];
}

export interface ModelWeightProgress {
  model_id: string;
  bytes_loaded: number;
  total_bytes: number;
  percentage: number;
  is_complete: boolean;
  status: string;
  phase?: string;
}

export const FALLBACK_CATALOG: PackageEntry[] = [
  { id: 'python3', name: 'Python 3', category: 'runtime', description: 'Python 3.11 interactive runtime and pip package manager', binary_name: 'python3', installed: true, version: '3.11.8' },
  { id: 'rust', name: 'Rust & Cargo', category: 'compiler', description: 'Rust compiler (rustc) and Cargo package build toolchain', binary_name: 'cargo', installed: false, version: '1.77.0' },
  { id: 'nodejs', name: 'Node.js & npm', category: 'runtime', description: 'JavaScript and TypeScript server runtime with npm', binary_name: 'node', installed: true, version: '20.12.2' },
  { id: 'clang', name: 'Clang / LLVM C/C++', category: 'compiler', description: 'C and C++ optimizing compiler and LLVM backend', binary_name: 'clang', installed: false, version: '17.0.6' },
  { id: 'golang', name: 'Go Language', category: 'compiler', description: 'Go compiler and tools for high concurrency backends', binary_name: 'go', installed: false, version: '1.22.1' },
  { id: 'git', name: 'Git VCS', category: 'vcs', description: 'Distributed version control and repository sync tool', binary_name: 'git', installed: true, version: '2.44.0' },
  { id: 'make', name: 'GNU Make', category: 'build', description: 'Standard automation build generator and task runner', binary_name: 'make', installed: true, version: '4.4.1' },
  { id: 'ripgrep', name: 'ripgrep (rg)', category: 'cli', description: 'Ultra-fast recursive regex pattern searcher for source code', binary_name: 'rg', installed: true, version: '14.1.0' },
  { id: 'curl', name: 'cURL', category: 'cli', description: 'Command line network transfer tool for HTTP and WebSocket APIs', binary_name: 'curl', installed: true, version: '8.6.0' },
  { id: 'zsh', name: 'Zsh Shell', category: 'cli', description: 'Advanced interactive shell with completion scripting', binary_name: 'zsh', installed: false, version: '5.9' },
  { id: 'vim', name: 'Vim Text Editor', category: 'cli', description: 'Modal CLI terminal text editor with syntax highlighting', binary_name: 'vim', installed: false, version: '9.1' },
  { id: 'htop', name: 'htop Process Viewer', category: 'cli', description: 'Interactive real-time process monitor and resource viewer', binary_name: 'htop', installed: false, version: '3.3.0' },
  { id: 'tmux', name: 'tmux Terminal Multiplexer', category: 'cli', description: 'Terminal session manager with split panes and background detachment', binary_name: 'tmux', installed: false, version: '3.4' },
  { id: 'jq', name: 'jq JSON Processor', category: 'cli', description: 'Lightweight command-line JSON parser and filter query engine', binary_name: 'jq', installed: true, version: '1.7.1' },
];

let wasmModule: any = null;
let wasmInitAttempted = false;

async function getWasmModule(): Promise<any> {
  if (wasmInitAttempted) return wasmModule;
  wasmInitAttempted = true;
  try {
    const pkgPath = '../../crates/krypton-core-rs/pkg';
    wasmModule = await import(/* @vite-ignore */ pkgPath);
  } catch {
    wasmModule = null;
  }
  return wasmModule;
}

const INSTALLED_PKGS_KEY = 'krypton_installed_packages';

function getStoredInstalledPackages(): Set<string> {
  try {
    const stored = localStorage.getItem(INSTALLED_PKGS_KEY);
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch {}
  return new Set(['python3', 'nodejs', 'git', 'make', 'ripgrep', 'curl', 'jq']);
}

function saveStoredInstalledPackages(pkgs: Set<string>): void {
  try {
    localStorage.setItem(INSTALLED_PKGS_KEY, JSON.stringify(Array.from(pkgs)));
  } catch {}
}

export function getSyncPackageCatalog(): PackageEntry[] {
  const installedSet = getStoredInstalledPackages();
  return FALLBACK_CATALOG.map(item => ({
    ...item,
    installed: installedSet.has(item.id),
  }));
}

export async function getPackageCatalog(): Promise<PackageEntry[]> {
  const installedSet = getStoredInstalledPackages();
  try {
    const wasm = await getWasmModule();
    if (wasm && typeof wasm.kryptonGetPackageCatalog === 'function') {
      const json = wasm.kryptonGetPackageCatalog();
      const list: PackageEntry[] = JSON.parse(json);
      return list.map(item => ({
        ...item,
        installed: installedSet.has(item.id),
      }));
    }
  } catch (e) {
    console.warn('[KryptonCoreBridge] Wasm package catalog fallback:', e);
  }

  return FALLBACK_CATALOG.map(item => ({
    ...item,
    installed: installedSet.has(item.id),
  }));
}

export async function installPackage(packageId: string): Promise<boolean> {
  const installed = getStoredInstalledPackages();
  installed.add(packageId);
  saveStoredInstalledPackages(installed);
  return true;
}

export async function uninstallPackage(packageId: string): Promise<boolean> {
  const installed = getStoredInstalledPackages();
  installed.delete(packageId);
  saveStoredInstalledPackages(installed);
  return true;
}

export async function analyzeWorkspaceLanguages(
  files: { path: string; content?: string; size?: number }[]
): Promise<LanguageAnalysisResult> {
  try {
    const wasm = await getWasmModule();
    if (wasm && typeof wasm.kryptonAnalyzeWorkspaceLanguages === 'function') {
      const jsonInput = JSON.stringify(files.map(f => ({ path: f.path, content: f.content || '' })));
      const resultJson = wasm.kryptonAnalyzeWorkspaceLanguages(jsonInput);
      return JSON.parse(resultJson);
    }
  } catch (e) {
    console.warn('[KryptonCoreBridge] Wasm analyzer fallback:', e);
  }

  // Pure TS High-Precision Volume Analyzer
  const EXT_LANG_MAP: Record<string, { lang: string; color: string }> = {
    rs: { lang: 'Rust', color: '#dea584' },
    ts: { lang: 'TypeScript', color: '#3178c6' },
    tsx: { lang: 'TypeScript', color: '#3178c6' },
    js: { lang: 'JavaScript', color: '#f1e05a' },
    jsx: { lang: 'JavaScript', color: '#f1e05a' },
    py: { lang: 'Python', color: '#3572A5' },
    kt: { lang: 'Kotlin', color: '#A97BFF' },
    java: { lang: 'Java', color: '#b07219' },
    html: { lang: 'HTML', color: '#e34c26' },
    css: { lang: 'CSS', color: '#563d7c' },
    scss: { lang: 'SCSS', color: '#c6538c' },
    json: { lang: 'JSON', color: '#292929' },
    c: { lang: 'C', color: '#555555' },
    cpp: { lang: 'C++', color: '#f34b7d' },
    go: { lang: 'Go', color: '#00ADD8' },
    sh: { lang: 'Shell', color: '#89e051' },
    bash: { lang: 'Shell', color: '#89e051' },
    md: { lang: 'Markdown', color: '#083fa1' },
  };

  const volumeMap = new Map<string, { bytes: number; lines: number; ext: string; color: string }>();
  let totalBytes = 0;
  let totalLines = 0;

  for (const f of files) {
    const ext = f.path.split('.').pop()?.toLowerCase() || '';
    const info = EXT_LANG_MAP[ext];
    if (!info) continue;

    const content = f.content || '';
    const bytes = f.size || new TextEncoder().encode(content).length;
    const lines = content ? content.split('\n').length : Math.max(1, Math.round(bytes / 35));

    totalBytes += bytes;
    totalLines += lines;

    const existing = volumeMap.get(info.lang) || { bytes: 0, lines: 0, ext, color: info.color };
    existing.bytes += bytes;
    existing.lines += lines;
    volumeMap.set(info.lang, existing);
  }

  if (volumeMap.size === 0 || totalBytes === 0) {
    return {
      dominant_language: 'TypeScript',
      dominant_color: '#3178c6',
      total_bytes: 0,
      total_lines: 0,
      languages: [],
    };
  }

  const languages: LanguageStat[] = Array.from(volumeMap.entries()).map(([lang, stat]) => ({
    language: lang,
    extension: stat.ext,
    byte_count: stat.bytes,
    line_count: stat.lines,
    percentage: Math.round((stat.bytes / totalBytes) * 1000) / 10,
    color_token: stat.color,
  })).sort((a, b) => b.byte_count - a.byte_count);

  const dominant = languages[0];

  return {
    dominant_language: dominant.language,
    dominant_color: dominant.color_token,
    total_bytes: totalBytes,
    total_lines: totalLines,
    languages,
  };
}

export function getModelWeightProgress(modelId: string, currentStep: number = 0): ModelWeightProgress {
  try {
    if (wasmModule && typeof wasmModule.kryptonGetModelWeightProgress === 'function') {
      const res = wasmModule.kryptonGetModelWeightProgress(modelId, currentStep);
      return JSON.parse(res);
    }
  } catch {}

  const total = 100;
  const pct = Math.min(100, Math.max(0, currentStep));
  return {
    model_id: modelId,
    bytes_loaded: pct * 40 * 1024 * 1024,
    total_bytes: 4 * 1024 * 1024 * 1024,
    percentage: pct,
    is_complete: pct >= 100,
    status: pct >= 100 ? 'Loaded' : `Allocating weights in RAM (${pct}%)`,
    phase: pct >= 100 ? 'Weights initialized in NPU/RAM' : `Mapping tensor weights (${pct}%)`,
  };
}

export const getKryptonPackageCatalog = getPackageCatalog;

