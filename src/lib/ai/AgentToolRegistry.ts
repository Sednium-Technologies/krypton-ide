/**
 * AgentToolRegistry: Unified tool execution harness for Oorty Lite.
 * Consolidates Filesystem, Terminal PTY, LSP (Monaco/Language Servers),
 * Live MCP JSON-RPC 2.0 Bridge, and AIF Cognitive Memory into a single, typed registry.
 */

import {
  CapacitorFilesystemRead,
  CapacitorFilesystemWrite,
  CapacitorFilesystemEditLines,
  CapacitorFilesystemInsertLines,
  CapacitorFilesystemPatch,
  CapacitorFilesystemMkdir,
  executeTerminalCommand,
  searchWeb,
  fetchWebPage,
  capturePreviewScreenshot,
  inspectPreviewDom,
  grepSearch,
  findFilesByName,
  listDirectory,
} from './toolActions';
import { useIdeStore } from '../../store/useIdeStore';
import { useProblemsStore, extractMonacoProblems } from '../../store/useProblemsStore';
import { useMcpStore } from '../../store/useMcpStore';
import { defaultAifManager, AifManager } from './AifManager';
import { LayaSystem1 } from '../pocket/LayaSystem1';
import { buildAndroidApkLocally } from '../localAndroidBuild';
import { useProjectsStore } from '../../store/useProjectsStore';

export interface AgentTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  category: 'filesystem' | 'terminal' | 'lsp' | 'mcp' | 'aif' | 'system1' | 'web' | 'preview';
  execute: (args: any) => Promise<{ success: boolean; data?: any; error?: string }>;
}

export class AgentToolRegistry {
  private tools: Map<string, AgentTool> = new Map();
  private aif: AifManager;

  constructor(aifManager?: AifManager) {
    this.aif = aifManager || defaultAifManager;
    this.registerBuiltinTools();
  }

  private registerBuiltinTools() {
    // ─── 1. Filesystem Tools ───────────────────────────────────────────
    this.registerTool({
      name: 'read_file',
      description: "Read the contents of a file with line numbers (e.g. '1: import React...').",
      category: 'filesystem',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The relative file path (e.g. src/App.tsx)' },
          start_line: { type: 'integer', description: 'Optional 1-indexed start line' },
          end_line: { type: 'integer', description: 'Optional 1-indexed end line (inclusive)' },
        },
        required: ['path'],
      },
      execute: async (args) => {
        try {
          const content = await CapacitorFilesystemRead(args.path, args.start_line, args.end_line);
          return { success: true, data: content };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    });

    this.registerTool({
      name: 'write_file',
      description: 'Create or completely rewrite a file with specified content.',
      category: 'filesystem',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The file path' },
          content: { type: 'string', description: 'Full file content' },
        },
        required: ['path', 'content'],
      },
      execute: async (args) => {
        try {
          await CapacitorFilesystemWrite(args.path, args.content);
          return { success: true, data: `File written at ${args.path}` };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    });

    // Alias for write_new_file
    this.registerTool({
      name: 'write_new_file',
      description: 'Create a new file with specified content.',
      category: 'filesystem',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The file path' },
          content: { type: 'string', description: 'Full file content' },
        },
        required: ['path', 'content'],
      },
      execute: async (args) => {
        try {
          await CapacitorFilesystemWrite(args.path, args.content);
          return { success: true, data: `File created at ${args.path}` };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    });

    this.registerTool({
      name: 'edit_lines',
      description: 'Replace a specific range of line numbers in an existing file.',
      category: 'filesystem',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The file path' },
          start_line: { type: 'integer', description: 'Starting line number (1-indexed)' },
          end_line: { type: 'integer', description: 'Ending line number (1-indexed, inclusive)' },
          new_content: { type: 'string', description: 'Replacement content string' },
        },
        required: ['path', 'start_line', 'end_line', 'new_content'],
      },
      execute: async (args) => {
        try {
          const res = await CapacitorFilesystemEditLines(args.path, args.start_line, args.end_line, args.new_content);
          return { success: true, data: res };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    });

    this.registerTool({
      name: 'insert_lines',
      description: 'Insert new lines before a specified line number without deleting existing lines.',
      category: 'filesystem',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The file path' },
          at_line: { type: 'integer', description: 'Line number to insert before (1-indexed)' },
          content: { type: 'string', description: 'Content to insert' },
        },
        required: ['path', 'at_line', 'content'],
      },
      execute: async (args) => {
        try {
          const res = await CapacitorFilesystemInsertLines(args.path, args.at_line, args.content);
          return { success: true, data: res };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    });

    this.registerTool({
      name: 'patch_file',
      description: 'Modify a file by searching for an exact code block and replacing it.',
      category: 'filesystem',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The file path' },
          search_string: { type: 'string', description: 'Exact text or snippet to replace' },
          replace_string: { type: 'string', description: 'Replacement text' },
        },
        required: ['path', 'search_string', 'replace_string'],
      },
      execute: async (args) => {
        try {
          const ok = await CapacitorFilesystemPatch(args.path, args.search_string, args.replace_string);
          if (ok) return { success: true, data: 'File patched successfully.' };
          return { success: false, error: 'Exact search string not found in target file.' };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    });

    this.registerTool({
      name: 'create_directory',
      description: 'Create a new directory or folder structure recursively.',
      category: 'filesystem',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path to create' },
        },
        required: ['path'],
      },
      execute: async (args) => {
        try {
          await CapacitorFilesystemMkdir(args.path, { recursive: true });
          return { success: true, data: `Directory created: ${args.path}` };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    });

    this.registerTool({
      name: 'list_dir',
      description: 'List files and directories in the workspace.',
      category: 'filesystem',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Optional subpath to list (defaults to root)' },
        },
      },
      execute: async (args) => {
        try {
          const list = await listDirectory(args?.path);
          return { success: true, data: list };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    });

    // ─── 2. Terminal PTY Tools ─────────────────────────────────────────
    const terminalTool: AgentTool = {
      name: 'execute_terminal_command',
      description: 'Execute a shell command inside the project directory using the native Linux userland terminal. Returns stdout, stderr, and exit code.',
      category: 'terminal',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The exact command string (e.g. npm test, cargo test, git status)' },
          timeoutMs: { type: 'integer', description: 'Timeout in milliseconds (defaults to 60000)' },
        },
        required: ['command'],
      },
      execute: async (args) => {
        try {
          const res = await executeTerminalCommand(args.command, args.timeoutMs || 60000);
          return {
            success: res.exitCode === 0,
            data: { ...res, command: args.command },
            error: res.exitCode !== 0 ? res.stderr || `Command failed with code ${res.exitCode}` : undefined,
          };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    };
    this.registerTool(terminalTool);
    // Alias for legacy run_terminal_command
    this.registerTool({
      ...terminalTool,
      name: 'run_terminal_command',
    });

    this.registerTool({
      name: 'build_android_apk',
      description: 'Builds an Android APK on-device with the local Gradle/JDK toolchain. Fails honestly when no toolchain is installed; use the cloud build workflow instead in that case.',
      category: 'terminal',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Optional Android project path. Defaults to the currently open project folder.',
          },
          variant: {
            type: 'string',
            enum: ['debug', 'release'],
            description: 'Build variant (default: debug)',
          },
        },
        required: [],
      },
      execute: async (args) => {
        try {
          const projectPath =
            args.path ||
            useProjectsStore.getState().getCurrentProject()?.folderPath;
          if (!projectPath) {
            return { success: false, error: 'No project path available for the Android build.' };
          }
          const variant = args.variant === 'release' ? 'release' : 'debug';
          const result = await buildAndroidApkLocally(projectPath, variant);
          return {
            success: true,
            data: {
              apkPath: result.apkPath,
              variant,
              log: result.log.split('\n').slice(-80).join('\n'),
            },
          };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    });

    // ─── 3. LSP Tools ──────────────────────────────────────────────────
    this.registerTool({
      name: 'lsp_get_diagnostics',
      description: 'Fetches active linter diagnostics, errors, warnings, and hints from Monaco/LSP.',
      category: 'lsp',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Optional file path filter' },
        },
      },
      execute: async (args) => {
        try {
          let problems = useProblemsStore.getState().problems;
          if (problems.length === 0 && typeof window !== 'undefined' && (window as any).monaco) {
            problems = extractMonacoProblems((window as any).monaco);
          }
          if (args?.path) {
            problems = problems.filter(p => p.filePath.includes(args.path) || p.fileName.includes(args.path));
          }
          return {
            success: true,
            data: problems.map(p => ({
              file: p.fileName,
              path: p.filePath,
              severity: p.severity,
              message: p.message,
              line: p.startLine,
              col: p.startCol,
            })),
          };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    });

    this.registerTool({
      name: 'lsp_get_symbols',
      description: 'Returns document symbols (functions, classes, interfaces, types) from a code file.',
      category: 'lsp',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The file path' },
        },
        required: ['path'],
      },
      execute: async (args) => {
        try {
          const content = await CapacitorFilesystemRead(args.path);
          const symbols: { name: string; kind: string; line: number }[] = [];
          const lines = content.split('\n');

          const symbolRegex = /\b(function|class|interface|type|const|let|enum|fn|struct|trait|impl)\s+([A-Za-z0-9_]+)/;
          for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(symbolRegex);
            if (match) {
              symbols.push({
                kind: match[1],
                name: match[2],
                line: i + 1,
              });
            }
          }

          return { success: true, data: symbols };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    });

    this.registerTool({
      name: 'lsp_find_definition',
      description: 'Locates the declaration / definition of a symbol across workspace files.',
      category: 'lsp',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'The identifier to locate' },
          path: { type: 'string', description: 'Optional initial file hint' },
        },
        required: ['symbol'],
      },
      execute: async (args) => {
        try {
          const files = useIdeStore.getState().files;
          const targetSym = args.symbol;
          const defRegex = new RegExp(`\\b(export\\s+)?(function|class|interface|type|const|let|enum|fn|struct|trait|impl)\\s+${targetSym}\\b`);
          const matches: { path: string; line: number; lineContent: string }[] = [];

          for (const [id, node] of Object.entries(files)) {
            if (node.type === 'file' && node.content) {
              const lines = node.content.split('\n');
              for (let i = 0; i < lines.length; i++) {
                if (defRegex.test(lines[i])) {
                  matches.push({
                    path: id,
                    line: i + 1,
                    lineContent: lines[i].trim(),
                  });
                }
              }
            }
          }

          return { success: true, data: matches };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    });

    // ─── 4. AIF Cognitive Memory Tools ────────────────────────────────
    this.registerTool({
      name: 'aif_recall',
      description: 'Recalls Red Core (INT16_CORE) memory and cross-project synaptic bridge pointers.',
      category: 'aif',
      parameters: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        try {
          const recall = await this.aif.recall();
          return { success: true, data: recall };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    });

    this.registerTool({
      name: 'aif_scratch',
      description: 'Arms the volatile scratch state before multi-file modifications or subagent delegation.',
      category: 'aif',
      parameters: {
        type: 'object',
        properties: {
          task_spec: { type: 'string', description: 'The current working state and task goal' },
        },
        required: ['task_spec'],
      },
      execute: async (args) => {
        try {
          this.aif.writeScratch(args.task_spec);
          return { success: true, data: 'Volatile scratch buffer armed.' };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    });

    this.registerTool({
      name: 'aif_note',
      description: 'Commits an end-of-turn cognitive note with an importance score (0.0 to 1.0).',
      category: 'aif',
      parameters: {
        type: 'object',
        properties: {
          importance: { type: 'number', description: 'Importance rating from 0.0 to 1.0 (>=0.70 commits to Red Core)' },
          summary: { type: 'string', description: 'Concise summary of decisions or modifications' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Semantic technical tags' },
        },
        required: ['importance', 'summary'],
      },
      execute: async (args) => {
        try {
          const res = await this.aif.commitNote(args);
          return { success: true, data: res.block };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    });

    this.registerTool({
      name: 'aif_query',
      description: 'Queries cognitive memory across projects for past architectural decisions.',
      category: 'aif',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Query text or tags' },
        },
        required: ['query'],
      },
      execute: async (args) => {
        try {
          const res = await this.aif.query(args.query);
          return { success: true, data: res };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    });

    // ─── 5. System 1 Contrastive Decision Tools (convaiinnovations/laya) ───
    this.registerTool({
      name: 'laya_status',
      description: 'Checks the local hardware acceleration, installation, and readiness status of the Laya System 1 decision engine.',
      category: 'system1',
      parameters: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        try {
          const status = LayaSystem1.getStatus();
          return { success: true, data: status };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    });

    this.registerTool({
      name: 'laya_contrastive_decision',
      description: 'Executes sub-35ms non-autoregressive contrastive option evaluation on Laya System 1. Ingests context state and candidate choices, returning normalized mathematical probabilities without text hallucination.',
      category: 'system1',
      parameters: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'Context state, code snippet, or prompt to evaluate' },
          choices: { type: 'array', items: { type: 'string' }, description: 'Candidate choices or classification options to score' },
        },
        required: ['state', 'choices'],
      },
      execute: async (args) => {
        try {
          const state = String(args.state || '');
          const choices = Array.isArray(args.choices) ? args.choices.map(String) : [];
          if (choices.length === 0) {
            return { success: false, error: 'choices array cannot be empty' };
          }
          const scores = await LayaSystem1.evaluateAsync(state, choices);
          let bestChoice = choices[0];
          let bestScore = -1;
          for (const [choice, score] of Object.entries(scores)) {
            if (score > bestScore) {
              bestScore = score;
              bestChoice = choice;
            }
          }
          return {
            success: true,
            data: {
              scores,
              bestChoice,
              bestScore,
              hardwareAccelerated: LayaSystem1.getStatus().isHardwareAccelerated,
            },
          };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    });

    // ─── 6. Workspace Code Search Tools ───────────────────────────────
    this.registerTool({
      name: 'grep_search',
      description: 'Search for text or regex patterns line-by-line across all files in the workspace. Returns file paths, line numbers, and matching lines.',
      category: 'filesystem',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The text or regex pattern to search for' },
          path: { type: 'string', description: 'Optional subfolder path filter (e.g. src/components)' },
          is_regex: { type: 'boolean', description: 'Whether query should be treated as a regular expression (default: false)' },
          case_sensitive: { type: 'boolean', description: 'Whether search should be case sensitive (default: false)' },
        },
        required: ['query'],
      },
      execute: async (args) => {
        try {
          const res = await grepSearch(args.query, args.path, args.is_regex, args.case_sensitive);
          return { success: true, data: res };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    });

    this.registerTool({
      name: 'find_files_by_name',
      description: 'Locate files and folders across the project by substring or glob pattern (e.g. "*.tsx", "Button", "config.json").',
      category: 'filesystem',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern or substring to match file and folder names' },
          path: { type: 'string', description: 'Optional directory path to restrict the search' },
        },
        required: ['pattern'],
      },
      execute: async (args) => {
        try {
          const res = await findFilesByName(args.pattern, args.path);
          return { success: true, data: res };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    });

    // ─── 7. Web Surfing & Live Documentation Tools ────────────────────
    this.registerTool({
      name: 'search_web',
      description: 'Search the public web for live technical documentation, API specifications, library updates, and error solutions.',
      category: 'web',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query keywords' },
          domain: { type: 'string', description: 'Optional domain to restrict search (e.g. github.com, npmjs.com, docs.rs)' },
        },
        required: ['query'],
      },
      execute: async (args) => {
        try {
          const res = await searchWeb(args.query, args.domain);
          return { success: true, data: res };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    });

    this.registerTool({
      name: 'fetch_web_page',
      description: 'Fetches and converts a web page or documentation URL into clean, readable Markdown with scripts and ads stripped.',
      category: 'web',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The full HTTP or HTTPS URL to fetch' },
          selector: { type: 'string', description: 'Optional CSS selector to extract only a specific section (e.g. article, main, .docs-body)' },
          maxLength: { type: 'integer', description: 'Max character length of returned text (default: 8000)' },
        },
        required: ['url'],
      },
      execute: async (args) => {
        try {
          const res = await fetchWebPage(args.url, args.selector, args.maxLength);
          return { success: true, data: res };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    });

    // ─── 8. Visual UI & Preview Inspection Tools ──────────────────────
    const screenshotTool: AgentTool = {
      name: 'take_screenshot',
      description: 'Captures a visual PNG screenshot of the Live Preview webview, an exact CSS selector element, or a cropped bounding box ({ x, y, width, height }). Returns base64 image data.',
      category: 'preview',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'Optional CSS selector of the specific element to screenshot (e.g. "#header", ".modal", "button.primary")' },
          clip: {
            type: 'object',
            description: 'Optional pixel bounding box to crop into: { x, y, width, height }',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              width: { type: 'number' },
              height: { type: 'number' },
            },
          },
          fullPage: { type: 'boolean', description: 'Whether to capture full scrollable document height (default: false)' },
        },
      },
      execute: async (args) => {
        try {
          const res = await capturePreviewScreenshot(args);
          return { success: true, data: res };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    };
    this.registerTool(screenshotTool);
    // Alias for capture_preview_screenshot
    this.registerTool({
      ...screenshotTool,
      name: 'capture_preview_screenshot',
    });

    this.registerTool({
      name: 'inspect_preview_dom',
      description: 'Inspects the live DOM accessibility tree, tags, classes, text, interactive attributes, and bounding box coordinates in the Live Preview webview before visual interaction.',
      category: 'preview',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'Optional CSS selector to start inspection from (defaults to preview root)' },
          depth: { type: 'integer', description: 'Maximum tree depth to traverse (default: 3)' },
        },
      },
      execute: async (args) => {
        try {
          const res = await inspectPreviewDom(args?.selector, args?.depth);
          return { success: true, data: res };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    });
  }

  registerTool(tool: AgentTool) {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): AgentTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Refreshes MCP tools dynamically from enabled servers via JSON-RPC 2.0.
   */
  async syncMcpTools(): Promise<void> {
    try {
      const servers = useMcpStore.getState().servers.filter(s => s.isEnabled);
      for (const server of servers) {
        try {
          const response = await fetch(server.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(server.authToken ? { Authorization: `Bearer ${server.authToken}` } : {}),
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'tools/list',
              params: {},
            }),
          });

          if (!response.ok) continue;
          const data = await response.json();
          const remoteTools = data.result?.tools || [];

          for (const rt of remoteTools) {
            const toolName = `mcp_${server.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${rt.name}`;
            this.registerTool({
              name: toolName,
              description: rt.description || `Tool from ${server.name}`,
              category: 'mcp',
              parameters: rt.inputSchema || { type: 'object', properties: {} },
              execute: async (args) => {
                const callRes = await fetch(server.url, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(server.authToken ? { Authorization: `Bearer ${server.authToken}` } : {}),
                  },
                  body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: Date.now(),
                    method: 'tools/call',
                    params: {
                      name: rt.name,
                      arguments: args,
                    },
                  }),
                });
                const callData = await callRes.json();
                if (callData.error) {
                  return { success: false, error: callData.error.message || JSON.stringify(callData.error) };
                }
                return { success: true, data: callData.result };
              },
            });
          }
        } catch (err) {
          console.warn(`[AgentToolRegistry] Failed to sync MCP tools from ${server.name}:`, err);
        }
      }
    } catch {}
  }

  /**
   * Executes a registered tool by name with arguments.
   */
  async execute(name: string, args: any): Promise<{ success: boolean; data?: any; error?: string }> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `Tool "${name}" is not registered in AgentToolRegistry.` };
    }
    return await tool.execute(args || {});
  }

  /**
   * Translates internal registered tools into provider-specific schemas.
   */
  formatForProvider(provider: string): any[] {
    const all = this.getAllTools();

    switch (provider) {
      case 'google':
      case 'gemini':
        return [{
          function_declarations: all.map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        }];

      case 'anthropic':
        return all.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
        }));

      case 'openai':
      case 'deepseek':
      case 'moonshot':
      case 'groq':
      case 'ollama':
      case 'mistral':
      case 'openrouter':
      default:
        return all.map(t => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }));
    }
  }
}

export const defaultToolRegistry = new AgentToolRegistry();
