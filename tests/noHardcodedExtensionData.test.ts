import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as storeModule from '../src/store/useExtensionsStore';

test('store no longer exports the hardcoded catalog', () => {
  assert.equal('EXTENSIONS_CATALOG' in storeModule, false);
});

test('no source file references EXTENSIONS_CATALOG', () => {
  const files = [
    'src/store/useExtensionsStore.ts',
    'src/store/useNavbarStore.ts',
    'src/components/sidebar/ExtensionsPanel.tsx',
    'src/components/sidebar/ExtensionViewPanel.tsx',
  ];
  for (const file of files) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.equal(source.includes('EXTENSIONS_CATALOG'), false, `${file} still references EXTENSIONS_CATALOG`);
  }
});
