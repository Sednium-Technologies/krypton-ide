import { create } from 'zustand';
import { readMcpConfig, saveMcpConfig, type McpServerConfig } from '../lib/fileSystemStorage';

export interface McpServer {
  id: string;              // UUID or identifier
  name: string;            // e.g., "GitHub MCP Server"
  type: 'sse' | 'http';    // Transport protocol
  url: string;             // Endpoint URI
  authToken?: string;      // Bearer token / API key
  isEnabled: boolean;      // Toggle switch
  toolsCount: number;      // Number of reported tools
}

export const MCP_PRESETS: Omit<McpServer, 'id'>[] = [
  {
    name: 'GitHub MCP Server',
    type: 'http',
    url: 'https://api.github.com/mcp',
    isEnabled: false,
    toolsCount: 14,
  },
  {
    name: 'Web Fetch MCP Server',
    type: 'http',
    url: 'https://mcp.fetch.local',
    isEnabled: false,
    toolsCount: 6,
  },
  {
    name: 'Filesystem MCP Server',
    type: 'http',
    url: 'http://localhost:3002/mcp',
    isEnabled: false,
    toolsCount: 9,
  },
];

export function getMcpPromptContext(servers: McpServer[]): string {
  const enabled = servers.filter(s => s.isEnabled);
  if (enabled.length === 0) return '';
  return [
    'Connected Model Context Protocol (MCP) Tools:',
    ...enabled.map(s => `- Server: ${s.name} (${s.url}) [Enabled]`),
    'When user instructions require external context, request MCP tool execution.'
  ].join('\n');
}

interface McpState {
  servers: McpServer[];
  isLoading: boolean;
  loadMcpServers: () => Promise<void>;
  addServer: (server: Omit<McpServer, 'id'>) => Promise<void>;
  addPreset: (presetIndex: number) => Promise<void>;
  removeServer: (id: string) => Promise<void>;
  toggleServer: (id: string) => Promise<void>;
  updateServer: (id: string, updates: Partial<McpServer>) => Promise<void>;
}

export const useMcpStore = create<McpState>()((set, get) => ({
  servers: [],
  isLoading: false,

  loadMcpServers: async () => {
    set({ isLoading: true });
    try {
      const stored = await readMcpConfig();
      if (stored && stored.length > 0) {
        const mapped: McpServer[] = stored.map((s) => ({
          id: s.id,
          name: s.name,
          type: s.type || 'http',
          url: s.url,
          authToken: (s as any).authToken,
          isEnabled: s.enabled ?? (s as any).isEnabled ?? true,
          toolsCount: (s as any).toolsCount || 0,
        }));
        set({ servers: mapped, isLoading: false });
      } else {
        // Pre-populate with default presets for instant usability
        const defaultServers: McpServer[] = MCP_PRESETS.map((p, idx) => ({
          ...p,
          id: `preset-${idx + 1}-${Date.now()}`,
          isEnabled: idx === 0, // Enable GitHub by default
        }));
        set({ servers: defaultServers, isLoading: false });
        await saveMcpConfig(
          defaultServers.map(s => ({
            id: s.id,
            name: s.name,
            type: s.type,
            url: s.url,
            enabled: s.isEnabled,
          }))
        );
      }
    } catch (e) {
      console.error('[McpStore] Failed to load MCP servers:', e);
      set({ isLoading: false });
    }
  },

  addServer: async (serverData) => {
    let parsed: URL;
    try {
      parsed = new URL(serverData.url);
    } catch {
      throw new Error('Security Error: Invalid MCP server URL.');
    }
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      throw new Error('Security Error: Remote MCP servers must use HTTPS.');
    }

    const id = `mcp-${Date.now()}`;
    const newServer: McpServer = {
      id,
      name: serverData.name,
      type: serverData.type,
      url: serverData.url,
      authToken: serverData.authToken,
      isEnabled: serverData.isEnabled ?? true,
      toolsCount: serverData.toolsCount || 0,
    };
    const updated = [...get().servers, newServer];
    set({ servers: updated });
    await saveMcpConfig(
      updated.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        url: s.url,
        enabled: s.isEnabled,
      }))
    );
  },

  addPreset: async (presetIndex: number) => {
    const preset = MCP_PRESETS[presetIndex];
    if (!preset) return;
    await get().addServer({ ...preset, isEnabled: true });
  },

  removeServer: async (id) => {
    const updated = get().servers.filter(s => s.id !== id);
    set({ servers: updated });
    await saveMcpConfig(
      updated.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        url: s.url,
        enabled: s.isEnabled,
      }))
    );
  },

  toggleServer: async (id) => {
    const updated = get().servers.map(s => s.id === id ? { ...s, isEnabled: !s.isEnabled } : s);
    set({ servers: updated });
    await saveMcpConfig(
      updated.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        url: s.url,
        enabled: s.isEnabled,
      }))
    );
  },

  updateServer: async (id, updates) => {
    const updated = get().servers.map(s => s.id === id ? { ...s, ...updates } : s);
    set({ servers: updated });
    await saveMcpConfig(
      updated.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        url: s.url,
        enabled: s.isEnabled,
      }))
    );
  },
}));
