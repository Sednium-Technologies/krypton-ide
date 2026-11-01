import test from 'node:test';
import assert from 'node:assert/strict';
import { MONACO_THEMES, registerMonacoTheme, resolveActiveMonacoTheme } from '../src/lib/monacoThemes';

test('built-in registry contains only the Krypton default', () => {
  assert.deepEqual(Object.keys(MONACO_THEMES), ['krypton-warm']);
});

test('registerMonacoTheme adds a package theme', () => {
  registerMonacoTheme('acme-ocean', {
    id: 'acme-ocean',
    name: 'Ocean',
    base: 'vs-dark',
    colors: { 'editor.background': '#001122' },
    rules: [],
  });
  assert.equal(MONACO_THEMES['acme-ocean'].name, 'Ocean');
});

test('resolveActiveMonacoTheme returns the active installed theme id', () => {
  assert.equal(resolveActiveMonacoTheme('vs-dark', 'acme-ocean'), 'acme-ocean');
  assert.equal(resolveActiveMonacoTheme('vs-dark', 'missing-theme'), 'krypton-warm');
  assert.equal(resolveActiveMonacoTheme('light', 'acme-ocean'), 'vs');
  assert.equal(resolveActiveMonacoTheme('vs-dark', null), 'krypton-warm');
});
