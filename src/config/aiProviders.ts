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
    models: [],
    defaultModel: '',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    requiresKey: true,
    description: 'Fast, multimodal frontier intelligence with deep coding reasoning',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    placeholder: 'sk-...',
    models: [],
    defaultModel: '',
    baseUrl: 'https://api.deepseek.com/v1',
    requiresKey: true,
    description: 'High-efficiency reasoning and code architecture models',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    placeholder: 'sk-...',
    models: [],
    defaultModel: '',
    baseUrl: 'https://api.openai.com/v1',
    requiresKey: true,
    description: 'Flagship reasoning and code generation models',
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    placeholder: 'sk-ant-...',
    models: [],
    defaultModel: '',
    baseUrl: 'https://api.anthropic.com/v1',
    requiresKey: true,
    description: 'Premier coding, architectural reasoning, and agentic workflows',
  },
  {
    id: 'moonshot',
    name: 'Moonshot (Kimi)',
    placeholder: 'sk-...',
    models: [],
    defaultModel: '',
    baseUrl: 'https://api.moonshot.cn/v1',
    requiresKey: true,
    description: 'Ultra-long context window reasoning and code analysis',
  },
  {
    id: 'groq',
    name: 'Groq Cloud',
    placeholder: 'gsk_...',
    models: [],
    defaultModel: '',
    baseUrl: 'https://api.groq.com/openai/v1',
    requiresKey: true,
    description: 'Ultra-low latency inference engine on LPUs',
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    placeholder: 'nvapi-...',
    models: [],
    defaultModel: '',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    requiresKey: true,
    description: 'NVIDIA accelerated AI models & NIM inference microservices',
  },
  {
    id: 'custom',
    name: 'Custom OpenAI',
    placeholder: 'sk-... (optional)',
    models: [],
    defaultModel: '',
    baseUrl: 'http://localhost:8080/v1',
    requiresKey: false,
    description: 'Any OpenAI-compatible server, proxy, vLLM, LMStudio, LocalAI, or gateway',
    allowCustomBaseUrl: true,
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    placeholder: 'No key needed',
    models: [],
    defaultModel: '',
    baseUrl: 'http://localhost:11434/v1',
    requiresKey: false,
    description: 'Run open-weight models completely offline and private on device',
    allowCustomBaseUrl: true,
  },
];

export const DEFAULT_AI_PROVIDER = 'google';
export const DEFAULT_AI_MODEL = '';

export function getProviderById(id: string): AiProviderConfig {
  // Support 'gemini' alias for 'google'
  const normalizedId = id === 'gemini' ? 'google' : id;
  return AI_PROVIDERS.find((p) => p.id === normalizedId) || AI_PROVIDERS[0];
}
