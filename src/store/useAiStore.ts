import { create } from 'zustand';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { ModelAdapters } from '../lib/ai/modelAdapters';
import { buildReasoningPayload, usesMaxCompletionTokens } from '../lib/ai/reasoning';
import { defaultToolRegistry } from '../lib/ai/AgentToolRegistry';
import { getAifManager } from '../lib/ai/AifManager';
import { LayaSystem1 } from '../lib/pocket/LayaSystem1';
import {
  readConfig,
  saveConfigDebounced,
  readApiKey,
  saveApiKey,
  readAllSessions,
  saveSessionDebounced,
  saveSession,
  deleteSessionFile,
  type KryptonConfig,
  type SavedModel,
} from '../lib/fileSystemStorage';
import { DEFAULT_AI_PROVIDER, DEFAULT_AI_MODEL, getProviderById } from '../config/aiProviders';



const MUTATING_TOOLS = new Set([
  'write_file',
  'write_new_file',
  'edit_lines',
  'insert_lines',
  'patch_file',
  'create_directory',
  'execute_terminal_command',
  'run_terminal_command',
  'build_android_apk',
]);

function parseNativePayload(data: any): any {
  if (typeof data !== 'string') return data;
  const trimmed = data.trim();
  if (!trimmed) return data;
  if (trimmed.startsWith('data:') || trimmed.startsWith('event:')) return trimmed;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function nativeErrorDetail(data: any): string {
  const parsed = parseNativePayload(data);
  if (typeof parsed === 'string') return parsed.slice(0, 1200);
  const detail = parsed?.error?.message
    || parsed?.message
    || parsed?.detail
    || JSON.stringify(parsed);
  return String(detail ?? '').slice(0, 1200);
}

function cleanChatTitle(raw: string): string | null {
  let title = String(raw || '').trim();
  if (!title) return null;
  title = title.split('\n')[0].trim();
  title = title
    .replace(/^title\s*:\s*/i, '')
    .replace(/^["'`*_#\s]+/, '')
    .replace(/["'`*_\s]+$/, '');
  if (!title) return null;
  if (title.length > 60) title = `${title.slice(0, 57).trimEnd()}...`;
  return title;
}

function extractCompletionText(provider: string, data: any): string {
  if (provider === 'google' || provider === 'gemini') {
    return (data?.candidates?.[0]?.content?.parts || [])
      .map((part: any) => part?.text || '')
      .join('');
  }
  if (provider === 'anthropic' || data?.type === 'message') {
    return (data?.content || [])
      .filter((block: any) => block?.type === 'text')
      .map((block: any) => block.text || '')
      .join('');
  }
  const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '';
  if (Array.isArray(content)) return content.map((block: any) => block?.text || '').join('');
  return typeof content === 'string' ? content : '';
}

async function requestChatTitle(opts: {
  provider: string;
  providerName: string;
  key: string;
  model: string;
  baseUrl: string;
  userPrompt: string;
}): Promise<string | null> {
  const { provider, providerName, key, model, baseUrl, userPrompt } = opts;
  const isGoogle = provider === 'google' || provider === 'gemini';
  const geminiModel = model.startsWith('models/') ? model.replace('models/', '') : model;
  const system = 'You write ultra-concise chat titles. Reply with ONLY the title, no quotes, no markdown, max 6 words.';
  const prompt = `Write a short title for a coding chat that starts with this request:\n\n${userPrompt.slice(0, 2000)}`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (isGoogle && key) headers['x-goog-api-key'] = key;
  if (!isGoogle && provider !== 'anthropic' && key) headers['Authorization'] = `Bearer ${key}`;
  if (provider === 'anthropic') {
    headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  }

  let url: string;
  let body: any;
  if (isGoogle) {
    url = `${baseUrl}/models/${geminiModel}:generateContent`;
    body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: { maxOutputTokens: 32, temperature: 0.2 },
    };
  } else if (provider === 'anthropic') {
    url = `${baseUrl}/messages`;
    body = {
      model,
      system,
      max_tokens: 32,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    };
  } else {
    url = `${baseUrl}/chat/completions`;
    body = {
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      stream: false,
    };
    if (provider === 'openai' && usesMaxCompletionTokens(provider, model)) {
      body.max_completion_tokens = 32;
    } else {
      body.max_tokens = 32;
    }
  }

  let data: any;
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.post({
      url,
      headers,
      data: body,
      connectTimeout: 15000,
      readTimeout: 20000,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`${providerName} title request HTTP ${response.status}: ${nativeErrorDetail(response.data)}`);
    }
    data = parseNativePayload(response.data);
  } else {
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!response.ok) {
      throw new Error(`${providerName} title request HTTP ${response.status}`);
    }
    data = await response.json();
  }

  return cleanChatTitle(extractCompletionText(provider, data));
}

/**
 * CapacitorHttp bypasses WebView CORS entirely. It cannot stream, so the
 * completion is converted back into SSE for the existing parser.
 */
async function requestNativeCompletion(
  provider: string,
  providerName: string,
  url: string,
  headers: Record<string, string>,
  body: any,
  isGoogle: boolean,
  geminiModel: string,
  baseUrl: string
): Promise<Response> {
  const nativeUrl = isGoogle
    ? `${baseUrl}/models/${geminiModel}:generateContent`
    : url;
  const nativeBody = isGoogle ? { ...body } : { ...body, stream: false };
  if (isGoogle) delete nativeBody.stream;

  const response = await CapacitorHttp.post({
    url: nativeUrl,
    headers,
    data: nativeBody,
    connectTimeout: 30000,
    readTimeout: 180000,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `${providerName} returned HTTP ${response.status}: ${nativeErrorDetail(response.data)}`
    );
  }

  const sse = ModelAdapters.toSseFromResponse(provider, parseNativePayload(response.data));
  return new Response(sse, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

export interface AttachedFile {
  name: string;
  type: string; // mimeType
  data: string; // base64
}

export interface Message {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  timestamp: number;
  completedAt?: number;
  tool_call_id?: string;
  name?: string;
  tool_calls?: any[];
  attachments?: AttachedFile[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

interface AiState {
  // Session State
  sessions: ChatSession[];
  activeSessionId: string | null;
  currentProjectId: string | null; // sessions are scoped to this project
  isLoading: boolean;
  streamingText: string;
  abortController: AbortController | null;

  // Configuration
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;

  savedModels: SavedModel[];
  activeModelId?: string;

  contextWindow: number; // default 128000
  maxOutputTokens: number; // default 8192
  reasoningEffort: 'none' | 'low' | 'medium' | 'high'; // default 'none'
  thinkingBudget: number; // default 0

  setContextWindow: (tokens: number) => void;
  setMaxOutputTokens: (tokens: number) => void;
  setReasoningEffort: (effort: 'none' | 'low' | 'medium' | 'high') => void;
  setThinkingBudget: (budget: number) => void;

  // Actions
  setProvider: (p: string) => void;
  setApiKey: (k: string) => void;
  setModel: (m: string) => void;
  setBaseUrl: (url: string) => void;
  addSavedModel: (model: SavedModel) => void;
  removeSavedModel: (id: string) => void;
  updateSavedModel: (id: string, updates: Partial<SavedModel>) => void;
  setActiveSavedModel: (id: string) => void;

  setActiveSession: (id: string) => void;
  addMessage: (sessionId: string, msg: Message) => void;
  updateSession: (sessionId: string, updates: Partial<ChatSession>) => void;
  createNewSession: () => string;
  deleteSession: (id: string) => void;

  // Load sessions for a specific project
  loadFromDisk: (projectId?: string) => Promise<void>;

  // Switch to a different project (clears sessions, loads new ones)
  switchProject: (projectId: string | null) => Promise<void>;

  // Clear all session state (when closing a project)
  clearSessions: () => void;

  // The Engine
  sendMessage: (sessionId: string, userPrompt: string, systemContext: string, attachments?: AttachedFile[]) => Promise<void>;
  handleRecursiveChat: (sessionId: string, provider: string, key: string, model: string, baseUrl: string, systemContext: string, startTime: number) => Promise<void>;
  abortChat: () => void;
}

// Helper to persist config changes
async function persistAiConfig(state: AiState) {
  const config = await readConfig();
  if (config) {
    config.ai = {
      ...config.ai,
      provider: state.provider,
      model: state.model,
      baseUrl: state.baseUrl,
      activeSessionId: state.activeSessionId,
      savedModels: state.savedModels,
      activeModelId: state.activeModelId,
    };
    saveConfigDebounced(config);
  }
}

export const useAiStore = create<AiState>()((set, get) => ({
  sessions: [],
  activeSessionId: null,
  currentProjectId: null,
  isLoading: false,
  streamingText: '',
  abortController: null,

  provider: DEFAULT_AI_PROVIDER,
  apiKey: '',
  model: DEFAULT_AI_MODEL,
  baseUrl: '',
  savedModels: [],
  activeModelId: undefined,
  contextWindow: 128000,
  maxOutputTokens: 8192,
  reasoningEffort: 'none',
  thinkingBudget: 0,

  setContextWindow: (tokens) => set({ contextWindow: tokens }),
  setMaxOutputTokens: (tokens) => set({ maxOutputTokens: tokens }),
  setReasoningEffort: (effort) => set({ reasoningEffort: effort }),
  setThinkingBudget: (budget) => set({ thinkingBudget: budget }),

  loadFromDisk: async (projectId?: string) => {
    try {
      // Load config (global)
      const config = await readConfig();
      if (config) {
        set({
          provider: config.ai.provider || DEFAULT_AI_PROVIDER,
          model: config.ai.model || DEFAULT_AI_MODEL,
          baseUrl: config.ai.baseUrl || '',
          savedModels: config.ai.savedModels || [],
          activeModelId: config.ai.activeModelId,
        });
      }

      // Load API key from private storage
      const apiKey = await readApiKey();
      if (apiKey) {
        set({ apiKey });
      }

      // Load sessions scoped to the project
      const pid = projectId || get().currentProjectId;
      if (pid) {
        const sessions = await readAllSessions(pid);
        sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        const activeId = sessions.length > 0 ? sessions[0].id : null;
        set({ sessions, activeSessionId: activeId, currentProjectId: pid });
      }
    } catch (e) {
      console.error('[AI] Failed to load from disk:', e);
    }
  },

  switchProject: async (projectId: string | null) => {
    // Clear existing sessions
    set({ sessions: [], activeSessionId: null, currentProjectId: projectId });

    if (projectId) {
      // Load this project's sessions
      const sessions = await readAllSessions(projectId);
      sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      const activeId = sessions.length > 0 ? sessions[0].id : null;
      set({ sessions, activeSessionId: activeId });
    }
  },

  clearSessions: () => {
    set({ sessions: [], activeSessionId: null, currentProjectId: null });
  },

  setProvider: (p) => {
    const prov = getProviderById(p);
    const existingBase = get().baseUrl;
    const nextBaseUrl = prov.allowCustomBaseUrl && existingBase ? existingBase : prov.baseUrl;
    set({
      provider: p,
      baseUrl: nextBaseUrl,
      model: prov.defaultModel || get().model,
    });
    persistAiConfig(get());
  },
  setApiKey: (apiKey) => {
    set({ apiKey });
    saveApiKey(apiKey).catch(e => console.error('[AI] Save API key error:', e));
  },
  setModel: (m) => {
    set({ model: m });
    persistAiConfig(get());
  },
  setBaseUrl: (baseUrl) => {
    if (baseUrl) {
      try {
        const u = new URL(baseUrl);
        if (u.hostname === '169.254.169.254' || u.host.includes('169.254.169.254')) {
          throw new Error('Security Error: Cloud metadata IP (169.254.169.254) is prohibited.');
        }
      } catch (err: any) {
        if (err?.message?.includes('Security Error')) throw err;
      }
    }
    set({ baseUrl });
    persistAiConfig(get());
  },

  addSavedModel: (model) => {
    set(state => ({ savedModels: [...state.savedModels, model] }));
    persistAiConfig(get());
  },
  removeSavedModel: (id) => {
    set(state => {
      const remaining = state.savedModels.filter(m => m.id !== id);
      const nextActiveId = state.activeModelId === id ? undefined : state.activeModelId;
      return { savedModels: remaining, activeModelId: nextActiveId };
    });
    persistAiConfig(get());
  },
  updateSavedModel: (id, updates) => {
    set(state => ({
      savedModels: state.savedModels.map(m => m.id === id ? { ...m, ...updates } : m)
    }));
    persistAiConfig(get());
  },
  setActiveSavedModel: (id) => {
    const saved = get().savedModels.find(m => m.id === id);
    if (saved) {
      set({
        activeModelId: id,
        provider: saved.provider,
        model: saved.model,
        baseUrl: saved.baseUrl || '',
        contextWindow: saved.contextWindow ?? 128000,
        maxOutputTokens: saved.maxOutputTokens ?? 8192,
        reasoningEffort: saved.reasoningEffort ?? 'none',
        thinkingBudget: saved.thinkingBudget ?? 0,
      });
      // Optionally also update apiKey if it carries one,
      // but apiKey is usually loaded globally, so setting the local state is fine.
      if (saved.apiKey) {
        set({ apiKey: saved.apiKey });
        saveApiKey(saved.apiKey).catch(e => console.error('[AI] Save API key error:', e));
      }
      persistAiConfig(get());
    }
  },
  abortChat: () => {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
      set({ abortController: null, isLoading: false });
    }
  },

  setActiveSession: (id) => {
    set({ activeSessionId: id });
    persistAiConfig(get());
  },

  addMessage: (sessionId, msg) => {
    set(state => {
      const newSessions = state.sessions.map(s =>
        s.id === sessionId
          ? { ...s, messages: [...s.messages, msg], updatedAt: Date.now() }
          : s
      );
      // Save session to disk (debounced) — scoped to current project
      const updated = newSessions.find(s => s.id === sessionId);
      if (updated) saveSessionDebounced(updated, get().currentProjectId || undefined);
      return { sessions: newSessions };
    });
  },

  updateSession: (sessionId, updates) => {
    set(state => {
      const newSessions = state.sessions.map(s => s.id === sessionId ? { ...s, ...updates } : s);
      const updated = newSessions.find(s => s.id === sessionId);
      if (updated) saveSessionDebounced(updated, get().currentProjectId || undefined);
      return { sessions: newSessions };
    });
  },

  createNewSession: () => {
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).substring(2);
    const newSession: ChatSession = {
      id,
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    set(state => {
      const newSessions = [newSession, ...state.sessions];
      // Save to disk — scoped to current project
      saveSession(newSession, get().currentProjectId || undefined).catch(e => console.error('[AI] Save new session error:', e));
      return { sessions: newSessions, activeSessionId: id };
    });
    // Persist active session in config
    persistAiConfig(get());
    return id;
  },

  deleteSession: (id) => {
    set(state => {
      const filtered = state.sessions.filter(s => s.id !== id);
      const nextId = state.activeSessionId === id ? (filtered[0]?.id || null) : state.activeSessionId;
      // Delete from disk — scoped to current project
      deleteSessionFile(id, get().currentProjectId || undefined).catch(e => console.error('[AI] Delete session error:', e));
      return { sessions: filtered, activeSessionId: nextId };
    });
  },

  sendMessage: async (sessionId, userPrompt, systemContext, attachments) => {
    const { addMessage, provider, apiKey, model, baseUrl, handleRecursiveChat } = get();
    const currentProvider = getProviderById(provider);
    const effectiveBaseUrl = (baseUrl && baseUrl.trim()) || currentProvider?.baseUrl || '';
    const aif = getAifManager(get().currentProjectId);
    defaultToolRegistry.setAifManager(aif);

    // Add user message
    addMessage(sessionId, {
      role: 'user',
      content: userPrompt,
      timestamp: Date.now(),
      attachments
    });

    // Ask the model for a fresh chat title at the start of every turn.
    if (userPrompt.trim() && model.trim()) {
      void requestChatTitle({
        provider,
        providerName: currentProvider?.name || provider,
        key: apiKey,
        model,
        baseUrl: effectiveBaseUrl,
        userPrompt,
      })
        .then((title) => {
          if (title) get().updateSession(sessionId, { title });
        })
        .catch((err) => console.warn('[AI] Chat title generation failed:', err));
    }

    // Fail with an actionable message instead of sending an invalid request.
    if (!model || !model.trim()) {
      addMessage(sessionId, {
        role: 'assistant',
        content: `**No model selected.** Choose a model for **${currentProvider?.name || provider}** before sending a message. If the model list is empty, check the API key and endpoint, then refresh the model list.`,
        timestamp: Date.now()
      });
      return;
    }

    if (currentProvider?.requiresKey && !apiKey.trim()) {
      addMessage(sessionId, {
        role: 'assistant',
        content: `**Missing API key.** Add a key for **${currentProvider.name}** in Settings before sending a message.`,
        timestamp: Date.now()
      });
      return;
    }

    // Safety: If the API key is corrupt (contains ESBuild error), clear it
    if (apiKey && apiKey.includes('Transform failed')) {
      get().setApiKey('');
      addMessage(sessionId, {
        role: 'assistant',
        content: `**System Warning**: I detected that your API key was corrupted by a build error. I have cleared it. Please go to **Settings** and re-enter your API key.`,
        timestamp: Date.now()
      });
      set({ isLoading: false });
      return;
    }

    // 1. Arm AIF volatile scratch buffer
    aif.writeScratch(userPrompt);

    // 2. Evaluate Laya System 1 fast path (<50ms intent router)
    if (!attachments || attachments.length === 0) {
      const route = LayaSystem1.routeIntent(userPrompt);
      if (route.path === 'fast_path' && route.fastResponse) {
        addMessage(sessionId, {
          role: 'assistant',
          content: route.fastResponse,
          timestamp: Date.now(),
          completedAt: Date.now(),
        });
        return;
      }
    }

    // 3. Automated Chat Boot Recall & Laya System 1 ambient status injection
    let effectiveSystemContext = systemContext;
    try {
      const recallState = await aif.recall();
      if (recallState.formattedContext) {
        effectiveSystemContext = `${systemContext}\n\n${recallState.formattedContext}\n`;
      }
    } catch (err) {
      console.warn('[AI] AIF boot recall failed:', err);
    }

    // Inform API LLM about on-device Laya System 1 reflex capability
    const layaStatus = LayaSystem1.getStatus();
    const layaContext = `\n[ON-DEVICE SYSTEM 1 CAPABILITY]: Laya Engine (${layaStatus.modelId}): ${layaStatus.isReady ? 'READY' : 'STANDBY'} (Hardware Accelerated: ${layaStatus.isHardwareAccelerated}). You have access to tool 'laya_contrastive_decision' to run sub-35ms non-autoregressive option scoring across candidate hypotheses, safety checks, or branch selections.\n`;
    effectiveSystemContext = `${effectiveSystemContext}\n${layaContext}`;

    const startTime = Date.now();
    const abortController = new AbortController();
    set({ isLoading: true, streamingText: '', abortController });

    try {
      await handleRecursiveChat(sessionId, provider, apiKey, model, effectiveBaseUrl, effectiveSystemContext, startTime);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        addMessage(sessionId, {
          role: 'assistant',
          content: `Generation canceled`,
          timestamp: Date.now()
        });
      } else {
        const rawMessage = String(error?.message || error || 'Unknown error');
        const friendlyMessage = /failed to fetch|networkerror|load failed/i.test(rawMessage)
          ? `Could not reach ${currentProvider?.name || provider} at ${effectiveBaseUrl || 'the configured endpoint'}. Technical detail: ${rawMessage}`
          : rawMessage;
        addMessage(sessionId, {
          role: 'assistant',
          content: `Error: ${friendlyMessage}`,
          timestamp: Date.now()
        });
      }
    } finally {
      set({ isLoading: false, abortController: null, streamingText: '' });
    }
  },

  handleRecursiveChat: async (sessionId, provider, key, model, baseUrl, systemContext, startTime) => {
    const session = get().sessions.find(s => s.id === sessionId);
    if (!session) return;

    const aif = getAifManager(get().currentProjectId);
    defaultToolRegistry.setAifManager(aif);
    const currentProvider = getProviderById(provider);
    const effectiveBaseUrl = (baseUrl && baseUrl.trim()) || currentProvider?.baseUrl || '';

    // Validate custom baseUrl against cloud metadata IP
    if (effectiveBaseUrl) {
      try {
        const parsedBase = new URL(effectiveBaseUrl);
        if (parsedBase.hostname === '169.254.169.254' || parsedBase.host.includes('169.254.169.254')) {
          throw new Error('Security Error: Cloud metadata IP (169.254.169.254) is prohibited.');
        }
      } catch (err: any) {
        if (err?.message?.includes('Security Error')) throw err;
      }
    }

    // 1. Prepare history for provider
    const normalizedHistory = session.messages.map(m => ({
      role: m.role,
      content: m.content,
      tool_calls: m.tool_calls,
      tool_call_id: m.tool_call_id,
      name: m.name,
      attachments: m.attachments
    }));

    const providerMessages = ModelAdapters.formatHistoryForProvider(provider, [
      { role: 'system', content: systemContext },
      ...normalizedHistory
    ] as any);

    const tools = ModelAdapters.getToolsForProvider(provider);
    const maxOutput = get().maxOutputTokens || 8192;
    const reasoning = get().reasoningEffort || 'none';
    const budget = get().thinkingBudget || 0;
    const reasoningPayload = buildReasoningPayload(provider, model, reasoning, budget, maxOutput);

    // 2. API Call
    const isGoogle = provider === 'google' || provider === 'gemini';
    const geminiModel = model.startsWith('models/') ? model.replace('models/', '') : model;
    let url: string;
    if (isGoogle) {
      url = `${effectiveBaseUrl}/models/${geminiModel}:streamGenerateContent?alt=sse`;
    } else if (provider === 'anthropic') {
      url = `${effectiveBaseUrl}/messages`;
    } else {
      url = `${effectiveBaseUrl}/chat/completions`;
    }

    const headers: any = { 'Content-Type': 'application/json' };
    if (isGoogle && key) headers['x-goog-api-key'] = key;
    if (!isGoogle && provider !== 'anthropic' && key) headers['Authorization'] = `Bearer ${key}`;
    if (provider === 'anthropic') {
      headers['x-api-key'] = key;
      headers['anthropic-version'] = '2023-06-01';
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    }

    let body: any = {};
    if (isGoogle) {
      body.contents = providerMessages;
      body.systemInstruction = { parts: [{ text: systemContext }] };
      body.tools = tools;
      body.generationConfig = {
        maxOutputTokens: maxOutput,
        ...(reasoningPayload.thinkingConfig ? { thinkingConfig: reasoningPayload.thinkingConfig } : {}),
      };
    } else if (provider === 'anthropic') {
      // Anthropic Messages API format
      body = {
        model,
        system: systemContext,
        max_tokens: maxOutput,
        ...(reasoningPayload.thinking ? { thinking: reasoningPayload.thinking } : {}),
        messages: providerMessages,
        tools: tools,
        stream: true
      };
    } else {
      // For OpenAI/Groq/Mistral/OpenRouter: OpenAI-compatible format
      // Re-inject system message into messages array (OpenAI supports role: 'system')
      const messagesWithSystem = [
        { role: 'system', content: systemContext },
        ...providerMessages
      ];
      body = {
        model,
        messages: messagesWithSystem,
        tools: tools,
        stream: true,
      };

      if (provider === 'openai') {
        if (usesMaxCompletionTokens(provider, model)) {
          body.max_completion_tokens = maxOutput;
        } else {
          body.max_tokens = maxOutput;
        }
        if (reasoningPayload.reasoning_effort) {
          body.reasoning_effort = reasoningPayload.reasoning_effort;
        }
      } else if (provider === 'openrouter') {
        body.max_tokens = maxOutput;
        if (reasoningPayload.reasoning) body.reasoning = reasoningPayload.reasoning;
      } else {
        // NVIDIA NIM, Groq, DeepSeek, Moonshot, Custom: OpenAI-compatible
        // max_tokens only. Reasoning fields vary by model, so never send
        // unrecognized reasoning fields to providers that may reject them.
        body.max_tokens = maxOutput;
      }
    }

    const providerName = currentProvider?.name || provider;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: get().abortController?.signal
      });
    } catch (fetchError: any) {
      if (fetchError?.name === 'AbortError') throw fetchError;

      if (!Capacitor.isNativePlatform()) {
        throw new Error(
          `Could not reach ${providerName} at ${effectiveBaseUrl}. The browser blocked the request (CORS) or the network is offline. Use the native Android app for this provider. Technical detail: ${String(fetchError?.message || fetchError)}`
        );
      }

      // Android WebView fetch is subject to CORS. Retry through the native
      // HTTP bridge, then feed a non-streaming response into the SSE parser.
      response = await requestNativeCompletion(
        provider,
        providerName,
        url,
        headers,
        body,
        isGoogle,
        geminiModel,
        effectiveBaseUrl
      );
    }

    if (!response.ok) {
      const errBody = await response.text();
      let errParsed;
      try { errParsed = JSON.parse(errBody); } catch(e) { errParsed = { message: errBody }; }
      const detail = errParsed?.error?.message || errParsed?.message || errParsed?.detail || errBody;
      throw new Error(`${providerName} returned HTTP ${response.status}: ${detail}`);
    }

    // STREAMING READER
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let accumulatedContent = '';
    let buffer = ''; // Buffer for partial lines
    const toolCallAccumulators: Record<string, { id: string, name: string, arguments: string, isObject: boolean, rawArgs: any }> = {};

    if (!reader) throw new Error('Stream reader not available');

    // Coalesce token updates to one state write per animation frame. Setting
    // state for every token re-rendered the whole chat many times per second.
    let streamingRaf: number | null = null;
    let streamingTimer: ReturnType<typeof setTimeout> | null = null;
    const flushStreaming = () => {
      if (streamingRaf !== null) {
        cancelAnimationFrame(streamingRaf);
        streamingRaf = null;
      }
      if (streamingTimer !== null) {
        clearTimeout(streamingTimer);
        streamingTimer = null;
      }
      set({ streamingText: accumulatedContent });
    };
    const scheduleStreaming = () => {
      if (streamingRaf !== null || streamingTimer !== null) return;
      if (typeof requestAnimationFrame === 'function') {
        streamingRaf = requestAnimationFrame(() => {
          streamingRaf = null;
          set({ streamingText: accumulatedContent });
        });
      } else {
        streamingTimer = setTimeout(() => {
          streamingTimer = null;
          set({ streamingText: accumulatedContent });
        }, 16);
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep partial line in buffer

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          const partialMessage = ModelAdapters.parseStreamChunk(provider, trimmedLine);
          if (partialMessage) {
            if (partialMessage.content) {
              accumulatedContent += partialMessage.content;
              scheduleStreaming();
            }
            if (partialMessage.tool_calls) {
              partialMessage.tool_calls.forEach((tc: any, index: number) => {
                const accKey = `idx_${tc.index ?? index ?? 0}`;
                if (!toolCallAccumulators[accKey]) {
                  toolCallAccumulators[accKey] = {
                    id: tc.id || `call_${accKey}`,
                    name: tc.name || '',
                    arguments: '',
                    isObject: false,
                    rawArgs: null
                  };
                } else {
                  if (tc.id && (!toolCallAccumulators[accKey].id || toolCallAccumulators[accKey].id.startsWith('call_idx_'))) {
                    toolCallAccumulators[accKey].id = tc.id;
                  }
                }
                if (tc.name) toolCallAccumulators[accKey].name = tc.name;

                if (tc.arguments) {
                  if (typeof tc.arguments === 'object') {
                    toolCallAccumulators[accKey].isObject = true;
                    toolCallAccumulators[accKey].rawArgs = tc.arguments;
                  } else {
                    toolCallAccumulators[accKey].arguments += tc.arguments;
                  }
                }
              });
            }
          }
        }
      }
    } finally {
      flushStreaming();
      reader.releaseLock();
    }

    // Process accumulated tool calls
    const finalToolCalls = Object.values(toolCallAccumulators).map(acc => {
      let parsedArgs: any = {};
      if (acc.isObject) {
        parsedArgs = acc.rawArgs;
      } else if (acc.arguments) {
        try {
          parsedArgs = JSON.parse(acc.arguments);
        } catch (err) {
          console.warn(`[useAiStore] Failed to parse tool arguments for ${acc.name || acc.id}:`, err);
          parsedArgs = {};
        }
      }
      return {
        id: acc.id,
        name: acc.name,
        arguments: parsedArgs
      };
    });

    // Result after stream finishes
    const result: any = {
      role: 'assistant',
      content: accumulatedContent,
      tool_calls: finalToolCalls.length > 0 ? finalToolCalls : undefined
    };

    // 3. Handle Tool Calls
    if (result.tool_calls && result.tool_calls.length > 0) {
      // Append assistant decision
      get().addMessage(sessionId, {
        role: 'assistant',
        content: result.content || '',
        tool_calls: result.tool_calls,
        timestamp: Date.now()
      });

      // Execute tools via unified AgentToolRegistry
      for (const tc of result.tool_calls) {
        let toolOutput = "";
        let toolAttachments: AttachedFile[] | undefined = undefined;
        try {
          const res = await defaultToolRegistry.execute(tc.name, tc.arguments);
          if (res.success) {
            toolOutput = typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2);
            if ((tc.name === 'take_screenshot' || tc.name === 'capture_preview_screenshot') && res.data?.base64) {
              toolAttachments = [{
                name: 'preview_screenshot.png',
                type: res.data.mimeType || 'image/png',
                data: res.data.base64,
              }];
            }
          } else {
            toolOutput = `Error: ${res.error || 'Execution failed'}`;
          }
        } catch (e: any) {
          toolOutput = `Local execution error: ${e.message}`;
        }

        get().addMessage(sessionId, {
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.name,
          content: toolOutput,
          timestamp: Date.now(),
          attachments: toolAttachments,
        });

        if (MUTATING_TOOLS.has(tc.name)) {
          const success = !toolOutput.startsWith('Error:') && !toolOutput.startsWith('Local execution error:');
          const argHint =
            typeof tc.arguments?.command === 'string'
              ? tc.arguments.command
              : typeof tc.arguments?.path === 'string'
                ? tc.arguments.path
                : typeof tc.arguments?.variant === 'string'
                  ? tc.arguments.variant
                  : '';
          await aif
            .commitNote({
              importance: success ? 0.5 : 0.7,
              summary: `${success ? 'Applied' : 'Failed'} ${tc.name}${argHint ? `: ${argHint}` : ''}`,
              tags: ['tool', tc.name, success ? 'success' : 'failure'],
              text: toolOutput.slice(0, 2000),
            })
            .catch(() => {});
        }
      }

      // 4. Recurse
      await get().handleRecursiveChat(sessionId, provider, key, model, effectiveBaseUrl, systemContext, startTime);
    } else {
      // Final message
      get().addMessage(sessionId, {
        role: 'assistant',
        content: result.content || '',
        timestamp: startTime,
        completedAt: Date.now()
      });

      // 5. Automatic End-of-Turn AIF Cognitive Commit
      try {
        const textToTag = `${result.content || ''}`;
        const tags = LayaSystem1.extractSemanticTags(textToTag);
        aif.commitNote({
          importance: 0.65,
          summary: result.content ? result.content.slice(0, 160).replace(/\n/g, ' ') : 'Oorty Lite turn completed',
          tags,
          text: result.content || '',
        }).catch(() => {});
      } catch {}
    }
    set({ streamingText: '' });
  }
}));
