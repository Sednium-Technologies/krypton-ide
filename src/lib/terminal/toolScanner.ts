export interface ScannedTool {
  id: string;
  name: string;
  category: 'Agent Harness' | 'Runtime' | 'Compiler' | 'Utility';
  binary: string;
  isInstalled: boolean;
  version?: string;
  path?: string;
  reason?: 'web-preview';
}

export const KNOWN_TOOLS: Array<Omit<ScannedTool, 'isInstalled' | 'version' | 'path' | 'reason'>> = [
  // Agent Harnesses
  { id: 'claude-code', name: 'Claude Code', category: 'Agent Harness', binary: 'claude' },
  { id: 'antigravity', name: 'Antigravity CLI', category: 'Agent Harness', binary: 'antigravity' },
  { id: 'gemini-cli', name: 'Gemini CLI', category: 'Agent Harness', binary: 'gemini' },
  { id: 'aider', name: 'Aider', category: 'Agent Harness', binary: 'aider' },
  { id: 'roo-cline', name: 'Roo Code', category: 'Agent Harness', binary: 'roo' },
  // Developer Runtimes
  { id: 'node', name: 'Node.js', category: 'Runtime', binary: 'node' },
  { id: 'npm', name: 'NPM Package Manager', category: 'Runtime', binary: 'npm' },
  { id: 'python3', name: 'Python 3', category: 'Runtime', binary: 'python3' },
  { id: 'git', name: 'Git Version Control', category: 'Utility', binary: 'git' },
  { id: 'cargo', name: 'Rust Cargo', category: 'Compiler', binary: 'cargo' },
  { id: 'clang', name: 'Clang / C++', category: 'Compiler', binary: 'clang' },
  { id: 'make', name: 'GNU Make', category: 'Utility', binary: 'make' },
  { id: 'curl', name: 'cURL Network Utility', category: 'Utility', binary: 'curl' },
];

export function scanToolsForEnvironment(options: {
  isNative: boolean;
  exists: (absolutePath: string) => boolean;
}): ScannedTool[] {
  const prefix = '/data/data/com.sednium.kryptonide.legacy/files/usr';
  return KNOWN_TOOLS.map((tool) => {
    if (!options.isNative) {
      return { ...tool, isInstalled: false, reason: 'web-preview' as const };
    }
    const path = `${prefix}/bin/${tool.binary}`;
    return { ...tool, isInstalled: options.exists(path), path };
  });
}
