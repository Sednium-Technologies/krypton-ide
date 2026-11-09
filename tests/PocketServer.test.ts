import test from 'node:test';
import assert from 'node:assert';
import { PocketRouter } from '../src/lib/pocket/PocketRouter';
import { usePocketStore } from '../src/store/usePocketStore';

test('PocketStore initializes with Laya System 1 as default engine', () => {
  const store = usePocketStore.getState();
  assert.ok(store.availableModels.length >= 3);
  
  // First models must be Laya / local GGUFs
  const firstModel = store.availableModels[0];
  assert.strictEqual(firstModel.id, 'laya-multilingual-fp16');
  assert.strictEqual(firstModel.type, 'local');

  const secondModel = store.availableModels[1];
  assert.strictEqual(secondModel.id, 'laya-multilingual-q4');
  assert.strictEqual(secondModel.type, 'local');
});

test('PocketStore switches active local model', () => {
  const store = usePocketStore.getState();
  store.selectModel('laya-multilingual-q4');
  assert.strictEqual(usePocketStore.getState().selectedModelId, 'laya-multilingual-q4');
});

test('PocketRouter intercepts fast_path query instantly without calling cloud API', async () => {
  const router = new PocketRouter();
  const res = await router.routeAndExecute({
    prompt: 'Who are you?',
    sessionId: 'session-1',
    fallbackApiExecute: async () => 'Should not be called',
  });

  assert.strictEqual(res.path, 'fast_path');
  assert.ok(res.response && res.response.includes('Oorty Lite'));
});

test('PocketRouter passes deep_reasoning query to fallback executor when no local LLM runner is bound', async () => {
  const router = new PocketRouter();
  let calledFallback = false;
  const res = await router.routeAndExecute({
    prompt: 'Refactor useAiStore to implement AgentToolRegistry and run tests',
    sessionId: 'session-2',
    fallbackApiExecute: async () => {
      calledFallback = true;
      return 'Dispatched to cloud model';
    },
  });

  assert.strictEqual(res.path, 'deep_reasoning');
  assert.strictEqual(calledFallback, true);
  assert.strictEqual(res.response, 'Dispatched to cloud model');
});

test('PocketStore discoverLocalModels discovers local models and merges available list', async () => {
  const store = usePocketStore.getState();
  const models = await store.discoverLocalModels();
  assert.ok(models.length >= 3);
  assert.ok(models.some(m => m.id === 'laya-multilingual-fp16'));
});
