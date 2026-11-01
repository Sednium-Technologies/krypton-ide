import test from 'node:test';
import assert from 'node:assert/strict';
import { getInstalledExtensions, findExtension } from '../src/lib/extensions/extensionRegistry';

const state = {
  customExtensions: [
    { id: 'a.one', name: 'One', publisher: 'a', description: '', icon: 'package', category: 'productivity' as const, installed: true },
    { id: 'b.two', name: 'Two', publisher: 'b', description: '', icon: 'package', category: 'productivity' as const, installed: false },
  ],
  installedExtensions: ['a.one'],
};

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
