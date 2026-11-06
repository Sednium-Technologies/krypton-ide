import { useAiStore } from '../../store/useAiStore';
import { readConfig, readApiKey } from '../fileSystemStorage';

interface CompletionContext {
  prefix: string;
  suffix: string;
  linePrefix: string;
  language: string;
  signal?: AbortSignal;
}

/**
 * Local heuristic predictor (< 5ms) for instant offline or pre-AI suggestions.
 * Recognizes common patterns such as:
 * - Variable combinations (e.g. v = 1; u = 4; k -> = u + v;)
 * - Standard library statements (console.log, for-loops, if-statements)
 * - Function declarations and brackets
 */
export function predictLocalCompletion(context: CompletionContext): string | null {
  const { prefix, linePrefix, language } = context;
  const trimmedLine = linePrefix.trim();
  const endsWithSpace = linePrefix.endsWith(' ');

  // Pattern 1: Variable arithmetic combination (e.g. v = 1; u = 4; k -> = u + v;)
  // Matches when current line ends with an identifier assignment candidate, with or without '='
  const varAssignMatch = trimmedLine.match(/^(?:let\s+|const\s+|var\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(=?)$/);
  if (varAssignMatch) {
    const currentVar = varAssignMatch[1];
    const hasEquals = varAssignMatch[2] === '=';

    // Find previously defined variables in the last 20 lines
    const prevLines = prefix.split('\n').slice(-20);
    const definedVars: string[] = [];
    for (const line of prevLines.slice(0, -1)) {
      const matches = [...line.matchAll(/(?:let|const|var)?\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g)];
      for (const m of matches) {
        if (m[1] && m[1] !== currentVar && !definedVars.includes(m[1])) {
          definedVars.push(m[1]);
        }
      }
    }

    if (definedVars.length >= 2) {
      const v1 = definedVars[definedVars.length - 1];
      const v2 = definedVars[definedVars.length - 2];
      const expr = `${v2} + ${v1}`;
      if (!hasEquals) {
        return ` = ${expr};`;
      } else {
        return endsWithSpace ? `${expr};` : ` ${expr};`;
      }
    } else if (definedVars.length === 1) {
      if (!hasEquals) {
        return ` = ${definedVars[0]};`;
      } else {
        return endsWithSpace ? `${definedVars[0]};` : ` ${definedVars[0]};`;
      }
    }
  }

  // Pattern 2: Console log completions
  if (trimmedLine.endsWith('console.')) return 'log();';
  if (trimmedLine.endsWith('console.l')) return 'og();';
  if (trimmedLine.endsWith('console.log(')) return '"debug", );';

  // Pattern 3: Common loop constructs
  if (trimmedLine === 'for (' || trimmedLine === 'for(') {
    return 'let i = 0; i < length; i++) {\n  \n}';
  }
  if (trimmedLine === 'for (let ' || trimmedLine === 'for(let ') {
    return 'i = 0; i < length; i++) {\n  \n}';
  }
  if (trimmedLine === 'if (' || trimmedLine === 'if(') {
    return 'condition) {\n  \n}';
  }
  if (trimmedLine === 'try {') {
    return '\n} catch (error) {\n  console.error(error);\n}';
  }

  // Pattern 4: Function declaration
  if (trimmedLine === 'function') {
    return ' handler() {\n  \n}';
  }
  if (trimmedLine === 'def') {
    return ' main():\n    pass';
  }

  // Pattern 5: React hooks
  if (trimmedLine.endsWith('useState(')) return 'null);';
  if (trimmedLine.endsWith('useEffect(() => {')) return '\n  return () => {};\n}, []);';
  if (trimmedLine.match(/^const\s+\[([a-zA-Z0-9_$]+),\s*$/)) {
    const match = trimmedLine.match(/^const\s+\[([a-zA-Z0-9_$]+),\s*$/);
    const varName = match ? match[1] : 'state';
    const setter = 'set' + varName.charAt(0).toUpperCase() + varName.slice(1);
    return `${setter}] = useState();`;
  }

  // Pattern 6: HTML tags
  if (language === 'html' || language === 'xml') {
    if (trimmedLine.endsWith('<div')) return ' class=""></div>';
    if (trimmedLine.endsWith('<span')) return '></span>';
    if (trimmedLine.endsWith('<button')) return ' type="button"></button>';
    if (trimmedLine.endsWith('<p')) return '></p>';
  }

  // Pattern 7: CSS common rules
  if (language === 'css' || language === 'scss') {
    if (trimmedLine.endsWith('display:')) return ' flex;';
    if (trimmedLine.endsWith('position:')) return ' relative;';
    if (trimmedLine.endsWith('color:')) return ' inherit;';
    if (trimmedLine.endsWith('background:')) return ' transparent;';
  }

  return null;
}

/**
 * High-performance on-device code completion powered by NinedayWang/PolyCoder-160M.
 * Formats prompts into Fill-in-the-Middle (FIM) or prefix-suffix spans and executes
 * via the local ONNX Runtime / native engine in <20ms on Big Cores.
 */
export async function fetchLocalPolyCoderCompletion(context: CompletionContext): Promise<string | null> {
  const { prefix, suffix, linePrefix, language, signal } = context;

  // 1. Check if native or local PolyCoder runner is active
  const localRunner = (typeof window !== 'undefined' ? (window as any).__KRYPTON_LOCAL_LLM__ : null);
  if (localRunner && typeof localRunner.completeFim === 'function') {
    try {
      const fimResult = await localRunner.completeFim({
        prefix: prefix.slice(-1000),
        suffix: suffix.slice(0, 300),
        language,
        maxTokens: 24,
      });
      if (fimResult && typeof fimResult === 'string') {
        return cleanCompletion(fimResult, linePrefix);
      }
    } catch (e) {
      console.warn('[PolyCoder-160M] Local inference failed, falling back to heuristics:', e);
    }
  }

  // 2. Try fast local heuristic predictor if model is not bound or offline
  return predictLocalCompletion(context);
}

function cleanCompletion(raw: string, linePrefix: string): string | null {
  let clean = raw.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  }
  const lastWord = linePrefix.trim().split(/[\s,;(=]+/).pop() || '';
  if (lastWord && clean.startsWith(lastWord)) {
    clean = clean.substring(lastWord.length);
  }
  return clean || null;
}

/**
 * Fast AI completion provider that requests the next code tokens
 * using configured low-latency LLMs (Groq, Gemini Flash, NVIDIA NIM, OpenRouter).
 */
export async function fetchAiInlineCompletion(context: CompletionContext): Promise<string | null> {
  const { prefix, suffix, linePrefix, language, signal } = context;

  // Check if PolyCoder is active or preferred local engine
  const pocketState = (await import('../../store/usePocketStore')).usePocketStore.getState();
  if (pocketState.selectedModelId === 'polycoder-160m-q4') {
    return fetchLocalPolyCoderCompletion(context);
  }

  const aiStore = useAiStore.getState();
  let apiKey = aiStore.apiKey;
  let provider = aiStore.provider || 'groq';

  // Check saved models if primary apiKey is not populated
  if (!apiKey && aiStore.savedModels && aiStore.savedModels.length > 0) {
    const activeModel = aiStore.savedModels.find(m => m.id === aiStore.activeModelId) || aiStore.savedModels[0];
    if (activeModel?.apiKey) {
      apiKey = activeModel.apiKey;
      provider = activeModel.provider || provider;
    }
  }

  // Fallback to reading private storage or stored config
  if (!apiKey) {
    try {
      apiKey = (await readApiKey()) || '';
    } catch {}
  }

  if (!apiKey) return null;

  // Auto-detect provider if key pattern is distinctive
  if (apiKey.startsWith('gsk_')) provider = 'groq';
  else if (apiKey.startsWith('AIzaSy')) provider = 'google';
  else if (apiKey.startsWith('nvapi-')) provider = 'nvidia';
  else if (apiKey.startsWith('sk-or-') || apiKey.startsWith('sk-air-')) provider = 'openrouter';

  const codeContext = `Language: ${language}
Code before cursor:
${prefix.slice(-1200)}
<CURSOR>
Code after cursor:
${suffix.slice(0, 400)}`;

  const systemPrompt = `You are an ultra-fast code autocompletion engine (like GitHub Copilot / Cursor Tab).
Your task is to predict the code that belongs immediately at <CURSOR>.
RULES:
1. Output ONLY the code to insert at <CURSOR>.
2. Do NOT output markdown code fences (\`\`\`).
3. Do NOT repeat code that is already before <CURSOR>.
4. Do NOT output explanations.
5. Max 1-3 lines of code.`;

  try {
    let completionText: string | null = null;

    if (provider === 'groq' || apiKey.startsWith('gsk_')) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: codeContext },
          ],
          max_tokens: 35,
          temperature: 0.1,
          stop: ['\n\n\n', '<CURSOR>'],
        }),
        signal,
      });

      if (res.ok) {
        const data = await res.json();
        completionText = data.choices?.[0]?.message?.content || null;
      }
    } else if (provider === 'google' || provider === 'gemini' || apiKey.startsWith('AIzaSy')) {
      const model = 'gemini-2.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Keep the key out of URLs/logs/referrers.
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\n${codeContext}` }],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 35,
            stopSequences: ['\n\n\n'],
          },
        }),
        signal,
      });

      if (res.ok) {
        const data = await res.json();
        completionText = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
      }
    } else if (provider === 'nvidia' || apiKey.startsWith('nvapi-')) {
      const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'meta/llama-3.1-8b-instruct',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: codeContext },
          ],
          max_tokens: 35,
          temperature: 0.1,
          stop: ['\n\n\n'],
        }),
        signal,
      });

      if (res.ok) {
        const data = await res.json();
        completionText = data.choices?.[0]?.message?.content || null;
      }
    } else if (provider === 'openrouter' || apiKey.startsWith('sk-or-') || apiKey.startsWith('sk-air-')) {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://kryptonide.web',
          'X-Title': 'Krypton IDE',
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-3.1-8b-instruct:free',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: codeContext },
          ],
          max_tokens: 35,
          temperature: 0.1,
          stop: ['\n\n\n', '<CURSOR>'],
        }),
        signal,
      });

      if (res.ok) {
        const data = await res.json();
        completionText = data.choices?.[0]?.message?.content || null;
      }
    }

    if (!completionText) return null;

    // Clean up response: remove markdown backticks if model emitted them
    let clean = completionText.trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    }

    // Ensure it doesn't repeat the prefix token
    const lastWord = linePrefix.trim().split(/[\s,;(=]+/).pop() || '';
    if (lastWord && clean.startsWith(lastWord)) {
      clean = clean.substring(lastWord.length);
    }

    return clean || null;
  } catch (err: any) {
    if (err?.name === 'AbortError') return null;
    console.warn('AI inline completion request failed:', err);
    return null;
  }
}
