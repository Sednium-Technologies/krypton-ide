import { defaultToolRegistry } from './AgentToolRegistry';

export interface NormalizedToolCall {
  id: string;
  name: string;
  arguments: any;
  index?: number;
}

export interface NormalizedAttachment {
  type: string;
  data: string;
  name?: string;
}

export interface NormalizedMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content?: string;
  name?: string;
  tool_calls?: NormalizedToolCall[];
  tool_call_id?: string;
  attachments?: NormalizedAttachment[];
}

function imageAttachments(message: NormalizedMessage): NormalizedAttachment[] {
  return (message.attachments || []).filter((attachment) =>
    typeof attachment.type === 'string' && attachment.type.startsWith('image/')
  );
}

function attachmentData(attachment: NormalizedAttachment): string {
  return attachment.data.includes('base64,')
    ? attachment.data.split(',')[1]
    : attachment.data;
}

/**
 * Adapter handles the differences between AI provider API formats
 */
export const ModelAdapters = {
  /**
   * Translates the standard internal tools into a provider-specific format
   */
  getToolsForProvider(provider: string): any[] {
    return defaultToolRegistry.formatForProvider(provider);
  },

  /**
   * Normalizes a provider's message response into our internal format
   */
  normalizeResponse(provider: string, data: any): NormalizedMessage {
    switch (provider) {
      case 'google':
      case 'gemini': {
        const candidate = data.candidates?.[0];
        const part = candidate?.content?.parts?.[0];

        if (part?.functionCall) {
          return {
            role: 'assistant',
            tool_calls: [{
              id: `gemini-${Date.now()}`,
              name: part.functionCall.name,
              arguments: part.functionCall.args
            }]
          };
        }
        return { role: 'assistant', content: part?.text || '' };
      }

      case 'anthropic': {
        const toolUse = data.content?.find((p: any) => p.type === 'tool_use');
        const textPart = data.content?.find((p: any) => p.type === 'text');

        if (toolUse) {
          return {
            role: 'assistant',
            content: textPart?.text || '',
            tool_calls: [{
              id: toolUse.id,
              name: toolUse.name,
              arguments: toolUse.input
            }]
          };
        }
        return { role: 'assistant', content: textPart?.text || '' };
      }

      case 'openai':
      case 'groq':
      case 'mistral':
      case 'openrouter':
      default: {
        const message = data.choices?.[0]?.message;
        if (message?.tool_calls) {
          return {
            role: 'assistant',
            content: message.content || '',
            tool_calls: message.tool_calls.map((tc: any) => ({
              id: tc.id,
              name: tc.function.name,
              arguments: JSON.parse(tc.function.arguments)
            }))
          };
        }
        return { role: 'assistant', content: message?.content || '' };
      }
    }
  },

  /**
   * Parses a raw stream chunk from the provider into a partial message
   */
  parseStreamChunk(provider: string, chunkText: string): NormalizedMessage | null {
    try {
      let jsonStr = chunkText.trim();

      // Skip SSE event-type lines (e.g. "event: content_block_delta")
      if (jsonStr.startsWith('event:')) return null;

      // OpenAI / Gemini (alt=sse) / Groq / Mistral / Anthropic (SSE format: data: {...})
      if (jsonStr.startsWith('data: ')) {
        jsonStr = jsonStr.replace(/^data: /, '').trim();
        if (jsonStr === '[DONE]') return null;

        const data = JSON.parse(jsonStr);

        // ── Anthropic SSE streaming format ──
        // Anthropic sends typed events: content_block_start, content_block_delta, etc.
        if (provider === 'anthropic' || data.type === 'content_block_delta' || data.type === 'content_block_start' || data.type === 'message_delta') {
          // Text delta: { type: "content_block_delta", delta: { type: "text_delta", text: "..." } }
          if (data.type === 'content_block_delta') {
            if (data.delta?.type === 'text_delta') {
              return { role: 'assistant', content: data.delta.text || '' };
            }
            // Tool input delta: { delta: { type: "input_json_delta", partial_json: "..." } }
            if (data.delta?.type === 'input_json_delta') {
              const idx = data.index ?? 0;
              return {
                role: 'assistant',
                tool_calls: [{
                  id: `call_idx_${idx}`,
                  index: idx,
                  name: '',
                  arguments: data.delta.partial_json || ''
                }]
              };
            }
            return null;
          }
          // Tool use start: { type: "content_block_start", content_block: { type: "tool_use", id: "...", name: "..." } }
          if (data.type === 'content_block_start' && data.content_block?.type === 'tool_use') {
            const idx = data.index ?? 0;
            return {
              role: 'assistant',
              tool_calls: [{
                id: data.content_block.id || `call_idx_${idx}`,
                index: idx,
                name: data.content_block.name || '',
                arguments: ''
              }]
            };
          }
          // message_start / message_delta / content_block_stop / message_stop — skip
          return null;
        }

        // ── Gemini SSE format ──
        if (provider === 'gemini' || data.candidates) {
          const candidate = data.candidates?.[0];
          const part = candidate?.content?.parts?.[0];

          if (part?.functionCall) {
            return {
              role: 'assistant',
              tool_calls: [{
                id: `gemini-${Date.now()}`,
                name: part.functionCall.name,
                arguments: part.functionCall.args
              }]
            };
          }
          return { role: 'assistant', content: part?.text || '' };
        }

        // ── OpenAI-compatible SSE format ──
        const delta = data.choices?.[0]?.delta;
        if (delta?.tool_calls) {
          return {
            role: 'assistant',
            tool_calls: delta.tool_calls.map((tc: any) => ({
              id: tc.id || (tc.index !== undefined ? `call_idx_${tc.index}` : undefined),
              index: tc.index ?? 0,
              name: tc.function?.name,
              arguments: tc.function?.arguments || ''
            }))
          };
        }
        return { role: 'assistant', content: delta?.content || '' };
      }

      // Legacy/Direct JSON Fallback
      if (jsonStr.startsWith('{')) {
        const data = JSON.parse(jsonStr);
        // Anthropic non-streaming fallback
        if (data.type === 'content_block_delta' && data.delta?.text) {
          return { role: 'assistant', content: data.delta.text };
        }
        // Gemini fallback
        const candidate = data.candidates?.[0];
        const part = candidate?.content?.parts?.[0];
        return { role: 'assistant', content: part?.text || '' };
      }

      return null;
    } catch (e) {
      return null;
    }
  },

  /**
   * Translates our internal history into provider-specific history format
   */
  formatHistoryForProvider(provider: string, messages: NormalizedMessage[]): any[] {
    // Filter out system messages — they are injected at the request body level, not in the messages array
    const filtered = messages.filter(m => m.role !== 'system');

    switch (provider) {
      case 'google':
      case 'gemini':
        // Gemini expects role: 'model' instead of 'assistant'
        // and uses contents array with parts
        return filtered.flatMap(m => {
          const images = imageAttachments(m);
          if (m.role === 'tool') {
            const out: any[] = [{
              role: 'function',
              parts: [{
                functionResponse: {
                  name: m.name,
                  response: { content: m.content }
                }
              }]
            }];
            if (images.length > 0) {
              out.push({
                role: 'user',
                parts: [
                  { text: `Image returned by tool ${m.name || ''}`.trim() },
                  ...images.map((attachment) => ({
                    inlineData: {
                      data: attachmentData(attachment),
                      mimeType: attachment.type
                    }
                  }))
                ]
              });
            }
            return out;
          }
          if (m.tool_calls) {
            return [{
              role: 'model',
              parts: [{
                functionCall: {
                  name: m.tool_calls[0].name,
                  args: m.tool_calls[0].arguments
                }
              }]
            }];
          }
          return [{
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [
              { text: m.content || '' },
              ...images.map((attachment) => ({
                inlineData: {
                  data: attachmentData(attachment),
                  mimeType: attachment.type
                }
              }))
            ]
          }];
        });

      case 'anthropic':
        // Anthropic handles tool results as part of the messages stream
        return filtered.map(m => {
          const images = imageAttachments(m);
          if (m.role === 'tool') {
            return {
              role: 'user',
              content: [{
                type: 'tool_result',
                tool_use_id: m.tool_call_id,
                content: images.length > 0
                  ? [
                      { type: 'text', text: m.content || '' },
                      ...images.map((attachment) => ({
                        type: 'image',
                        source: {
                          type: 'base64',
                          media_type: attachment.type,
                          data: attachmentData(attachment)
                        }
                      }))
                    ]
                  : m.content
              }]
            };
          }
          if (m.tool_calls) {
            return {
              role: 'assistant',
              content: [
                ...(m.content ? [{ type: 'text', text: m.content }] : []),
                {
                  type: 'tool_use',
                  id: m.tool_calls[0].id,
                  name: m.tool_calls[0].name,
                  input: m.tool_calls[0].arguments
                }
              ]
            } as any;
          }
          return {
            role: m.role as any,
            content: images.length > 0
              ? [
                  { type: 'text', text: m.content || '' },
                  ...images.map((attachment) => ({
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: attachment.type,
                      data: attachmentData(attachment)
                    }
                  }))
                ]
              : (m.content || '')
          };
        });

      default:
        // OpenAI format
        return filtered.flatMap(m => {
          const images = imageAttachments(m);
          if (m.role === 'tool') {
            const out: any[] = [{
              role: 'tool',
              tool_call_id: m.tool_call_id,
              content: m.content
            }];
            if (images.length > 0) {
              out.push({
                role: 'user',
                content: [
                  { type: 'text', text: `Image returned by tool ${m.name || ''}`.trim() },
                  ...images.map((attachment) => ({
                    type: 'image_url',
                    image_url: {
                      url: attachment.data.includes('base64,')
                        ? attachment.data
                        : `data:${attachment.type};base64,${attachment.data}`
                    }
                  }))
                ]
              });
            }
            return out;
          }
          if (m.tool_calls) {
             return [{
               role: 'assistant',
               content: m.content,
               tool_calls: m.tool_calls.map(tc => ({
                 id: tc.id,
                 type: 'function',
                 function: {
                   name: tc.name,
                   arguments: JSON.stringify(tc.arguments)
                 }
               }))
             }];
          }
          return [{
            role: m.role,
            content: images.length > 0
              ? [
                  { type: 'text', text: m.content || '' },
                  ...images.map((attachment) => ({
                    type: 'image_url',
                    image_url: {
                      url: attachment.data.includes('base64,')
                        ? attachment.data
                        : `data:${attachment.type};base64,${attachment.data}`
                    }
                  }))
                ]
              : (m.content || '')
          }];
        });
    }
  }
};
