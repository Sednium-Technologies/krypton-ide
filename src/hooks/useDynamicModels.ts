import { useState, useEffect, useCallback, useRef } from 'react';
import { getProviderById } from '../config/aiProviders';

export interface AIModel {
  id: string;
  name: string;
  description?: string;
  created?: number;
}

interface CachedModelsData {
  models: AIModel[];
  timestamp: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour TTL for model cache

export function useDynamicModels(provider: string, apiKey?: string, customBaseUrl?: string) {
  const [models, setModels] = useState<AIModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const getCacheKey = useCallback(() => {
    const urlKey = customBaseUrl ? `_${encodeURIComponent(customBaseUrl)}` : '';
    const keyFingerprint = apiKey ? `_${apiKey.trim().slice(-8)}` : '_nokey';
    return `krypton_dynamic_models_v3_${provider}${urlKey}${keyFingerprint}`;
  }, [provider, apiKey, customBaseUrl]);

  // Read live cached models on key/provider change
  useEffect(() => {
    const cacheKey = getCacheKey();
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed: CachedModelsData = JSON.parse(cached);
        if (Array.isArray(parsed.models) && parsed.models.length > 0) {
          setModels(parsed.models);
          setLastUpdated(parsed.timestamp);
          setIsLive(true);
          return;
        }
      }
    } catch {}

    setModels([]);
    setIsLive(false);
  }, [getCacheKey]);

  const fetchModelsFromApi = useCallback(async (isManual: boolean = false) => {
    const p = getProviderById(provider);
    const requiresKey = p?.requiresKey ?? true;
    const cleanKey = (apiKey || '').trim();

    // Check if key is needed
    if (requiresKey && !cleanKey && provider !== 'openrouter' && provider !== 'ollama' && provider !== 'custom') {
      setModels([]);
      setIsLive(false);
      setError('API key required to fetch live endpoint models');
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

    setIsLoading(true);
    setError(null);

    try {
      let url = '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      const cleanBase = (customBaseUrl || p?.baseUrl || '').replace(/\/$/, '');

      switch (provider) {
        case 'google':
        case 'gemini':
          url = `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`;
          break;

        case 'openai':
          url = `${cleanBase || 'https://api.openai.com/v1'}/models`;
          headers['Authorization'] = `Bearer ${cleanKey}`;
          break;

        case 'nvidia':
          url = `${cleanBase || 'https://integrate.api.nvidia.com/v1'}/models`;
          headers['Authorization'] = `Bearer ${cleanKey}`;
          break;

        case 'deepseek':
          url = `${cleanBase || 'https://api.deepseek.com'}/models`;
          headers['Authorization'] = `Bearer ${cleanKey}`;
          break;

        case 'moonshot':
          url = `${cleanBase || 'https://api.moonshot.cn/v1'}/models`;
          headers['Authorization'] = `Bearer ${cleanKey}`;
          break;

        case 'groq':
          url = `${cleanBase || 'https://api.groq.com/openai/v1'}/models`;
          headers['Authorization'] = `Bearer ${cleanKey}`;
          break;

        case 'ollama':
          url = `${cleanBase || 'http://localhost:11434/v1'}/models`;
          if (cleanKey) headers['Authorization'] = `Bearer ${cleanKey}`;
          break;

        case 'custom':
          url = `${cleanBase || 'http://localhost:8080/v1'}/models`;
          if (cleanKey) headers['Authorization'] = `Bearer ${cleanKey}`;
          break;

        case 'openrouter':
          url = 'https://openrouter.ai/api/v1/models';
          if (cleanKey) headers['Authorization'] = `Bearer ${cleanKey}`;
          break;

        case 'mistral':
          url = `${cleanBase || 'https://api.mistral.ai/v1'}/models`;
          headers['Authorization'] = `Bearer ${cleanKey}`;
          break;

        case 'anthropic':
          url = `${cleanBase || 'https://api.anthropic.com/v1'}/models`;
          headers['x-api-key'] = cleanKey || '';
          headers['anthropic-version'] = '2023-06-01';
          headers['anthropic-dangerous-direct-browser-access'] = 'true';
          break;

        default:
          url = `${cleanBase}/models`;
          if (cleanKey) headers['Authorization'] = `Bearer ${cleanKey}`;
          break;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: provider === 'google' || provider === 'gemini' ? undefined : headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || errData.message || `Status ${response.status}`);
      }

      const data = await response.json();
      let rawModels: any[] = [];

      if (provider === 'google' || provider === 'gemini') {
        const list = data.models || [];
        rawModels = list.filter((m: any) => 
          !m.supportedGenerationMethods || 
          m.supportedGenerationMethods.includes('generateContent')
        );
      } else if (Array.isArray(data)) {
        rawModels = data;
      } else if (Array.isArray(data.data)) {
        rawModels = data.data;
      } else if (Array.isArray(data.models)) {
        rawModels = data.models;
      }

      const formattedModels: AIModel[] = rawModels
        .map((item: any) => {
          let id = item.id || item.name;
          if ((provider === 'google' || provider === 'gemini') && typeof id === 'string' && id.startsWith('models/')) {
            id = id.replace('models/', '');
          }
          return {
            id: String(id),
            name: item.displayName || item.name || id,
            description: item.description,
            created: item.created,
          };
        })
        .filter((m) => Boolean(m.id && m.id.trim()));

      // Prioritize and sort models: popular chat/agent models at top
      formattedModels.sort((a, b) => {
        const aIsChat = /^(gpt|o\d|claude|gemini|deepseek|llama|qwen|mistral)/i.test(a.id);
        const bIsChat = /^(gpt|o\d|claude|gemini|deepseek|llama|qwen|mistral)/i.test(b.id);
        if (aIsChat && !bIsChat) return -1;
        if (!aIsChat && bIsChat) return 1;
        return a.id.localeCompare(b.id);
      });

      // Use strictly live models returned from the endpoint
      const finalModels = formattedModels;
      const now = Date.now();

      setModels(finalModels);
      setIsLive(formattedModels.length > 0);
      setLastUpdated(now);

      // Save to localStorage cache with key fingerprint
      if (finalModels.length > 0) {
        try {
          const cacheEntry: CachedModelsData = {
            models: finalModels,
            timestamp: now,
          };
          localStorage.setItem(getCacheKey(), JSON.stringify(cacheEntry));
        } catch {}
      }

    } catch (err: any) {
      console.warn(`[useDynamicModels] Failed to fetch live models for ${provider}:`, err.message);
      
      const cacheKey = getCacheKey();
      let hasCached = false;
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed: CachedModelsData = JSON.parse(cached);
          if (parsed.models?.length > 0) {
            setModels(parsed.models);
            setLastUpdated(parsed.timestamp);
            setIsLive(true);
            hasCached = true;
          }
        }
      } catch {}

      if (!hasCached) {
        setModels([]);
        setIsLive(false);
      }

      if (isManual || err.name === 'AbortError') {
        setError(err.name === 'AbortError' ? 'Timeout fetching models (12s)' : (err.message || 'Failed to fetch models'));
      }
    } finally {
      setIsLoading(false);
      clearTimeout(timeoutId);
    }
  }, [provider, apiKey, customBaseUrl, getCacheKey]);

  // Instant trigger when apiKey, provider, or customBaseUrl changes
  useEffect(() => {
    const p = getProviderById(provider);
    const requiresKey = p?.requiresKey ?? true;
    const cleanKey = (apiKey || '').trim();

    // If key required and not present, don't query
    if (requiresKey && !cleanKey && provider !== 'openrouter' && provider !== 'ollama' && provider !== 'custom') {
      setModels([]);
      setIsLive(false);
      return;
    }

    // Debounce by 350ms to allow smooth typing while immediately pulling upon pause/paste
    const timer = setTimeout(() => {
      fetchModelsFromApi(true);
    }, 350);

    return () => clearTimeout(timer);
  }, [provider, apiKey, customBaseUrl, fetchModelsFromApi]);

  // Periodic Auto-Update Over Time (checks every 30 minutes in background)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchModelsFromApi(false);
    }, 30 * 60 * 1000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const cacheKey = getCacheKey();
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const parsed: CachedModelsData = JSON.parse(cached);
            if (Date.now() - parsed.timestamp > CACHE_TTL_MS) {
              fetchModelsFromApi(false);
            }
          } else {
            fetchModelsFromApi(false);
          }
        } catch {}
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchModelsFromApi, getCacheKey]);

  const refresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  return {
    models,
    isLoading,
    isLive,
    error,
    lastUpdated,
    refresh,
  };
}
