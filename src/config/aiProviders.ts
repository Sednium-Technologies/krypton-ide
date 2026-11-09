/**
 * Krypton IDE — AI Infrastructure Providers
 * Strict Dynamic Endpoint Discovery: All models are retrieved live from provider /models endpoints.
 * Zero hardcoded presets or legacy static rosters.
 */

export interface AiProviderConfig {
  id: string;
  name: string;
  placeholder: string;
  models?: string[];
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
    description: 'Multimodal frontier intelligence with live endpoint discovery',
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    placeholder: 'sk-ant-...',
    models: [],
    defaultModel: '',
    baseUrl: 'https://api.anthropic.com/v1',
    requiresKey: true,
    description: 'Architectural reasoning, coding, and agentic workflows with live model discovery',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    placeholder: 'sk-...',
    models: [],
    defaultModel: '',
    baseUrl: 'https://api.openai.com/v1',
    requiresKey: true,
    description: 'Flagship reasoning and code generation models discovered via /models',
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
    id: 'openrouter',
    name: 'OpenRouter',
    placeholder: 'sk-or-v1-... (optional for free models)',
    models: [],
    defaultModel: '',
    baseUrl: 'https://openrouter.ai/api/v1',
    requiresKey: false,
    description: 'Unified gateway with live discovery across 300+ frontier and open-weight models',
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    placeholder: 'nvapi-...',
    models: [],
    defaultModel: '',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    requiresKey: true,
    description: 'NVIDIA accelerated AI models & NIM inference microservices with live discovery',
  },
  {
    id: 'groq',
    name: 'Groq Cloud',
    placeholder: 'gsk_...',
    models: [],
    defaultModel: '',
    baseUrl: 'https://api.groq.com/openai/v1',
    requiresKey: true,
    description: 'Ultra-low latency inference engine on LPUs with dynamic /models retrieval',
  },
  {
    id: 'moonshot',
    name: 'Moonshot (Kimi)',
    placeholder: 'sk-...',
    models: [],
    defaultModel: '',
    baseUrl: 'https://api.moonshot.cn/v1',
    requiresKey: true,
    description: 'Ultra-long context window reasoning models fetched live',
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
    description: 'Run open-weight models offline on device with live endpoint discovery',
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
