export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';

function normalizedModel(provider: string, model: string): string {
  if (provider === 'google' || provider === 'gemini') {
    return model.replace(/^models\//, '').toLowerCase();
  }
  return model.toLowerCase();
}

export function supportsReasoningControl(provider: string, model: string): boolean {
  const id = normalizedModel(provider, model);
  if (!id) return false;

  switch (provider) {
    case 'google':
    case 'gemini':
      return /gemini-(2\.5|3)/.test(id) || id.includes('thinking');
    case 'anthropic':
      return /claude-(3[-.]?7|4|[a-z]+-4)/.test(id) || id.includes('thinking');
    case 'openai':
      return /(^|\/)(o[1-9]|gpt-[56]|codex)/.test(id) && !id.includes('chat');
    case 'openrouter':
      return /(^|\/)(o[1-9]|gpt-[56]|codex)/.test(id)
        || /thinking|reasoning/.test(id)
        || /claude-(3[-.]?7|4|[a-z]+-4)/.test(id)
        || /gemini-(2\.5|3)/.test(id)
        || /deepseek-r1|qwen3|magistral/.test(id);
    default:
      return false;
  }
}

export function usesMaxCompletionTokens(provider: string, model: string): boolean {
  if (provider !== 'openai') return false;
  const id = normalizedModel(provider, model);
  return /(^|\/)(o[1-9]|gpt-[56]|codex)/.test(id);
}

function reasoningBudget(effort: ReasoningEffort, budget: number): number {
  if (budget > 0) return budget;
  if (effort === 'low') return 1024;
  if (effort === 'medium') return 4096;
  if (effort === 'high') return 8192;
  return 0;
}

export function buildReasoningPayload(
  provider: string,
  model: string,
  effort: ReasoningEffort,
  budget: number,
  maxOutput: number
): Record<string, any> {
  if (!supportsReasoningControl(provider, model)) return {};
  if (effort === 'none' && budget <= 0) return {};

  const requestedBudget = reasoningBudget(effort, budget);

  switch (provider) {
    case 'google':
    case 'gemini':
      if (normalizedModel(provider, model).includes('gemini-3')) {
        return {
          thinkingConfig: {
            thinkingLevel: requestedBudget >= 4096 ? 'high' : 'low',
          },
        };
      }
      return {
        thinkingConfig: {
          thinkingBudget: Math.min(Math.max(requestedBudget, 1024), 32768),
        },
      };
    case 'anthropic': {
      if (maxOutput <= 1024) return {};
      return {
        thinking: {
          type: 'enabled',
          budget_tokens: Math.max(1024, Math.min(requestedBudget, maxOutput - 1)),
        },
      };
    }
    case 'openai':
      return effort === 'none' ? {} : { reasoning_effort: effort };
    case 'openrouter':
      return effort === 'none' ? {} : { reasoning: { effort } };
    default:
      return {};
  }
}
