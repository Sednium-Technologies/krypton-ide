/**
 * Krypton IDE — AI Providers and Frontier Models Roster
 * Ported from OortyLiteProviders.kt & SettingsStore.kt specifications
 */

export interface AiProviderConfig {
  id: string;
  name: string;
  placeholder: string;
  models: string[];
  defaultModel: string;
  baseUrl: string;
  requiresKey: boolean;
  description?: string;
  allowCustomBaseUrl?: boolean;
}

export const AI_PROVIDERS: AiProviderConfig[] = [
  {
    id: 'google',
    name: 'Google Gemini',
    placeholder: 'AIzaSy...',
    models: [
      'gemini-3.5-flash',
      'gemini-3.5-pro',
      'gemini-3-flash',
      'gemini-3-pro',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
    ],
    defaultModel: 'gemini-3.5-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    requiresKey: true,
    description: 'Fast, multimodal frontier intelligence with deep coding reasoning',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    placeholder: 'sk-...',
    models: [
      'deepseek-v4-pro',
      'deepseek-v4-lite',
      'deepseek-chat',
    ],
    defaultModel: 'deepseek-v4-pro',
    baseUrl: 'https://api.deepseek.com/v1',
    requiresKey: true,
    description: 'High-efficiency reasoning and code architecture models',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    placeholder: 'sk-...',
    models: [
      'gpt-5.5',
      'gpt-5-mini',
      'o4-mini',
      'o3-mini',
      'gpt-4.1',
    ],
    defaultModel: 'gpt-5.5',
    baseUrl: 'https://api.openai.com/v1',
    requiresKey: true,
    description: 'Flagship reasoning and code generation models',
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    placeholder: 'sk-ant-...',
    models: [
      'claude-sonnet-4-6',
      'claude-opus-4-6',
      'claude-3-7-sonnet',
      'claude-3-5-haiku',
    ],
    defaultModel: 'claude-sonnet-4-6',
    baseUrl: 'https://api.anthropic.com/v1',
    requiresKey: true,
    description: 'Premier coding, architectural reasoning, and agentic workflows',
  },
  {
    id: 'moonshot',
    name: 'Moonshot (Kimi)',
    placeholder: 'sk-...',
    models: [
      'kimi-k3',
      'kimi-k2.5',
      'moonshot-v1-32k',
    ],
    defaultModel: 'kimi-k3',
    baseUrl: 'https://api.moonshot.cn/v1',
    requiresKey: true,
    description: 'Ultra-long context window reasoning and code analysis',
  },
  {
    id: 'groq',
    name: 'Groq Cloud',
    placeholder: 'gsk_...',
    models: [
      'llama-4-scout',
      'llama-3.3-70b-versatile',
      'deepseek-r1-distill-llama-70b',
    ],
    defaultModel: 'llama-4-scout',
    baseUrl: 'https://api.groq.com/openai/v1',
    requiresKey: true,
    description: 'Ultra-low latency inference engine on LPUs',
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    placeholder: 'nvapi-...',
    models: [
      'meta/llama-3.3-70b-instruct',
      'deepseek-ai/deepseek-r1',
      'nvidia/llama-3.1-nemotron-70b-instruct',
      'mistralai/mistral-large-2-instruct',
      'qwen/qwen2.5-coder-32b-instruct',
    ],
    defaultModel: 'meta/llama-3.3-70b-instruct',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    requiresKey: true,
    description: 'NVIDIA accelerated AI models & NIM inference microservices',
  },
  {
    id: 'custom',
    name: 'Custom OpenAI',
    placeholder: 'sk-... (optional)',
    models: [
      'default-model',
    ],
    defaultModel: 'default-model',
    baseUrl: 'http://localhost:8080/v1',
    requiresKey: false,
    description: 'Any OpenAI-compatible server, proxy, vLLM, LMStudio, LocalAI, or gateway',
    allowCustomBaseUrl: true,
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    placeholder: 'No key needed',
    models: [
      'llama3.2',
      'codellama',
      'deepseek-coder-v2',
      'qwen2.5-coder',
    ],
    defaultModel: 'llama3.2',
    baseUrl: 'http://localhost:11434/v1',
    requiresKey: false,
    description: 'Run open-weight models completely offline and private on device',
    allowCustomBaseUrl: true,
  },
];

export const DEFAULT_AI_PROVIDER = 'google';
export const DEFAULT_AI_MODEL = 'gemini-3.5-flash';

export function getProviderById(id: string): AiProviderConfig {
  // Support 'gemini' alias for 'google'
  const normalizedId = id === 'gemini' ? 'google' : id;
  return AI_PROVIDERS.find((p) => p.id === normalizedId) || AI_PROVIDERS[0];
}
