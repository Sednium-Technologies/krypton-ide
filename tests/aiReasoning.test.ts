import test from 'node:test';
import assert from 'node:assert';
import {
  buildReasoningPayload,
  supportsReasoningControl,
  usesMaxCompletionTokens,
} from '../src/lib/ai/reasoning';
import { ModelAdapters } from '../src/lib/ai/modelAdapters';

test('reasoning controls are limited to models that support them', () => {
  assert.strictEqual(supportsReasoningControl('google', 'gemini-2.5-flash'), true);
  assert.strictEqual(supportsReasoningControl('google', 'gemini-1.5-pro'), false);
  assert.strictEqual(supportsReasoningControl('anthropic', 'claude-3-5-sonnet-latest'), false);
  assert.strictEqual(supportsReasoningControl('anthropic', 'claude-3-7-sonnet-latest'), true);
  assert.strictEqual(supportsReasoningControl('anthropic', 'claude-sonnet-4-5'), true);
  assert.strictEqual(supportsReasoningControl('openai', 'gpt-4o'), false);
  assert.strictEqual(supportsReasoningControl('openai', 'gpt-5'), true);
  assert.strictEqual(supportsReasoningControl('openai', 'gpt-5-chat-latest'), false);
  assert.strictEqual(supportsReasoningControl('openai', 'o3-mini'), true);
  assert.strictEqual(supportsReasoningControl('openrouter', 'deepseek/deepseek-r1'), true);
  assert.strictEqual(supportsReasoningControl('nvidia', 'meta/llama-3.1-70b-instruct'), false);
});

test('reasoning payloads are provider-specific and safely clamped', () => {
  assert.deepStrictEqual(buildReasoningPayload('google', 'gemini-1.5-pro', 'high', 0, 8192), {});
  assert.deepStrictEqual(
    buildReasoningPayload('google', 'gemini-2.5-flash', 'medium', 0, 8192),
    { thinkingConfig: { thinkingBudget: 4096 } }
  );
  assert.deepStrictEqual(
    buildReasoningPayload('google', 'gemini-3-pro-preview', 'high', 0, 8192),
    { thinkingConfig: { thinkingLevel: 'high' } }
  );
  assert.deepStrictEqual(
    buildReasoningPayload('anthropic', 'claude-3-5-sonnet-latest', 'high', 0, 8192),
    {}
  );
  const anthropic = buildReasoningPayload('anthropic', 'claude-sonnet-4', 'high', 0, 8192);
  assert.strictEqual(anthropic.thinking.type, 'enabled');
  assert.ok(anthropic.thinking.budget_tokens >= 1024);
  assert.ok(anthropic.thinking.budget_tokens < 8192);
  assert.deepStrictEqual(
    buildReasoningPayload('anthropic', 'claude-sonnet-4', 'high', 0, 512),
    {}
  );
  assert.deepStrictEqual(
    buildReasoningPayload('openai', 'gpt-4o', 'high', 0, 8192),
    {}
  );
  assert.deepStrictEqual(
    buildReasoningPayload('openai', 'gpt-5', 'high', 0, 8192),
    { reasoning_effort: 'high' }
  );
  assert.deepStrictEqual(
    buildReasoningPayload('openrouter', 'deepseek/deepseek-r1', 'medium', 0, 8192),
    { reasoning: { effort: 'medium' } }
  );
  assert.deepStrictEqual(
    buildReasoningPayload('nvidia', 'deepseek-ai/deepseek-r1', 'high', 0, 8192),
    {}
  );
});

test('only OpenAI reasoning families use max_completion_tokens', () => {
  assert.strictEqual(usesMaxCompletionTokens('openai', 'gpt-5'), true);
  assert.strictEqual(usesMaxCompletionTokens('openai', 'gpt-5-chat-latest'), true);
  assert.strictEqual(usesMaxCompletionTokens('openai', 'o3-mini'), true);
  assert.strictEqual(usesMaxCompletionTokens('openai', 'gpt-4o'), false);
  assert.strictEqual(usesMaxCompletionTokens('openrouter', 'openai/gpt-5'), false);
  assert.strictEqual(usesMaxCompletionTokens('nvidia', 'meta/llama-3.1-70b-instruct'), false);
});

test('native completion conversion produces parseable SSE for OpenAI-compatible providers', () => {
  const sse = ModelAdapters.toSseFromResponse('nvidia', {
    choices: [{
      message: {
        content: 'Done',
        tool_calls: [{
          id: 'call_1',
          type: 'function',
          function: { name: 'read_file', arguments: '{"path":"README.md"}' },
        }],
      },
    }],
  });

  const parsed = sse
    .split('\n')
    .filter((line) => line.startsWith('data: {'))
    .map((line) => ModelAdapters.parseStreamChunk('nvidia', line))
    .filter(Boolean);

  assert.strictEqual(parsed[0]?.content, 'Done');
  assert.strictEqual(parsed[0]?.tool_calls?.[0].name, 'read_file');
  assert.strictEqual(parsed[0]?.tool_calls?.[0].arguments, '{"path":"README.md"}');
});

test('native completion conversion supports Gemini and Anthropic tool calls', () => {
  const geminiSse = ModelAdapters.toSseFromResponse('google', {
    candidates: [{
      content: {
        parts: [
          { text: 'Checking' },
          { functionCall: { name: 'list_dir', args: { path: 'src' } } },
        ],
      },
    }],
  });
  const gemini = geminiSse
    .split('\n')
    .filter((line) => line.startsWith('data: {'))
    .map((line) => ModelAdapters.parseStreamChunk('google', line))
    .filter(Boolean);
  assert.strictEqual(gemini[0]?.content, 'Checking');
  assert.strictEqual(gemini[1]?.tool_calls?.[0].name, 'list_dir');

  const anthropicSse = ModelAdapters.toSseFromResponse('anthropic', {
    type: 'message',
    content: [
      { type: 'text', text: 'Checking' },
      { type: 'tool_use', id: 'tool_1', name: 'read_file', input: { path: 'README.md' } },
    ],
  });
  const anthropic = anthropicSse
    .split('\n')
    .filter((line) => line.startsWith('data: {'))
    .map((line) => ModelAdapters.parseStreamChunk('anthropic', line))
    .filter(Boolean);

  assert.strictEqual(anthropic[0]?.content, 'Checking');
  assert.strictEqual(anthropic[1]?.tool_calls?.[0].name, 'read_file');
  assert.strictEqual(
    anthropic.slice(1).map((m) => m?.tool_calls?.[0].arguments || '').join(''),
    '{"path":"README.md"}'
  );
});
