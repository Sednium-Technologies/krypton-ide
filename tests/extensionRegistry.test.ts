import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getInstalledExtensions,
  findExtension,
  reconcileInstalledExtensions,
  deriveActiveMonacoThemeId,
} from '../src/lib/extensions/extensionRegistry';

const state = {
  customExtensions: [
    { id: 'a.one', name: 'One', publisher: 'a', description: '', icon: 'package', category: 'productivity' as const, installed: true },
    { id: 'b.two', name: 'Two', publisher: 'b', description: '', icon: 'package', category: 'productivity' as const, installed: false },
  ],
  installedExtensions: ['a.one'],
};

const extensions = [
  { id: 'a.one', name: 'One', publisher: 'a', description: '', icon: 'package', category: 'productivity' as const, installed: true, monacoThemeId: 'a-one-theme' },
  { id: 'b.two', name: 'Two', publisher: 'b', description: '', icon: 'package', category: 'productivity' as const, installed: true, monacoThemeId: 'b-two-theme' },
  { id: 'theme.three', name: 'Three', publisher: 'c', description: '', icon: 'palette', category: 'theme' as const, installed: true, monacoThemeId: 'three-theme', iconThemeId: 'three-icons' },
];

test('getInstalledExtensions returns only installed custom extensions', () => {
  const result = getInstalledExtensions(state);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'a.one');
  assert.equal(result[0].installed, true);
});

test('findExtension resolves any custom extension by id', () => {
  assert.equal(findExtension(state, 'b.two')?.name, 'Two');
  assert.equal(findExtension(state, 'theme-dracula'), undefined);
});

test('reconcileInstalledExtensions prunes stale catalog ids, keeps valid ids, dedupes, and preserves order', () => {
  assert.deepEqual(
    reconcileInstalledExtensions(
      ['b.two', 'anthropic.claude-code', 'a.one', 'b.two', 'missing.extension'],
      extensions
    ),
    ['b.two', 'a.one']
  );
});

test('reconcileInstalledExtensions prunes all ids when the custom catalog is missing', () => {
  assert.deepEqual(reconcileInstalledExtensions(['a.one', 'b.two'], undefined), []);
  assert.deepEqual(reconcileInstalledExtensions(['a.one', 'b.two'], []), []);
});

test('reconcileInstalledExtensions handles empty and undefined installed input', () => {
  assert.deepEqual(reconcileInstalledExtensions([], extensions), []);
  assert.deepEqual(reconcileInstalledExtensions(undefined, extensions), []);
  assert.deepEqual(reconcileInstalledExtensions(null, extensions), []);
});

test('deriveActiveMonacoThemeId prefers persisted theme, then the active extension theme', () => {
  assert.equal(deriveActiveMonacoThemeId('persisted-theme', 'theme.three', extensions), 'persisted-theme');
  assert.equal(deriveActiveMonacoThemeId(null, 'theme.three', extensions), 'three-theme');
  assert.equal(deriveActiveMonacoThemeId('', 'b.two', extensions), 'b-two-theme');
  assert.equal(deriveActiveMonacoThemeId(undefined, 'a.one', extensions), 'a-one-theme');
  assert.equal(deriveActiveMonacoThemeId(null, 'missing.extension', extensions), null);
  assert.equal(deriveActiveMonacoThemeId(null, null, extensions), null);
});

function stubLocalStorage() {
  const originalLocalStorage = (globalThis as any).localStorage;
  const memory = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
    removeItem: (key: string) => memory.delete(key),
    key: (index: number) => Array.from(memory.keys())[index] ?? null,
    get length() {
      return memory.size;
    },
  };

  return {
    memory,
    restore: () => {
      if (originalLocalStorage === undefined) {
        delete (globalThis as any).localStorage;
      } else {
        (globalThis as any).localStorage = originalLocalStorage;
      }
    },
  };
}

test('loadFromDisk reconciles persisted installed ids and derives the theme', async () => {
  const { memory, restore } = stubLocalStorage();

  try {
    memory.set('krypton-base-path', '/tmp/krypton');
    memory.set(
      'kfs:/tmp/krypton/extensions.json',
      JSON.stringify({
        installedExtensions: ['b.two', 'anthropic.claude-code', 'a.one', 'b.two'],
        activeThemeExtension: 'theme.three',
        customExtensions: extensions,
      })
    );

    const { useExtensionsStore } = await import('../src/store/useExtensionsStore');
    await useExtensionsStore.getState().loadFromDisk();

    const loaded = useExtensionsStore.getState();
    assert.deepEqual(loaded.installedExtensions, ['b.two', 'a.one']);
    assert.equal(loaded.activeMonacoThemeId, 'three-theme');
  } finally {
    restore();
  }
});

test('uninstallExtension clears theme and icon state owned by the removed extension', async () => {
  const { memory, restore } = stubLocalStorage();

  try {
    memory.set('krypton-base-path', '/tmp/krypton');
    memory.set(
      'kfs:/tmp/krypton/extensions.json',
      JSON.stringify({
        installedExtensions: ['b.two', 'theme.three'],
        activeThemeExtension: 'theme.three',
        activeMonacoThemeId: 'three-theme',
        activeIconTheme: 'three-icons',
        customExtensions: extensions,
      })
    );

    const { useExtensionsStore } = await import('../src/store/useExtensionsStore');
    await useExtensionsStore.getState().loadFromDisk();
    useExtensionsStore.getState().uninstallExtension('theme.three');

    const state = useExtensionsStore.getState();
    assert.deepEqual(state.installedExtensions, ['b.two']);
    assert.equal(state.activeThemeExtension, null);
    assert.equal(state.activeMonacoThemeId, null);
    assert.equal(state.activeIconTheme, null);
  } finally {
    restore();
  }
});
