import test from 'node:test';
import assert from 'node:assert/strict';
import { useExtensionHostStore } from '../src/store/useExtensionHostStore';
import type { InstalledExtension } from '../src/lib/extensions/nativeExtensionHost';

const configExt: InstalledExtension = {
  id: 'publisher.linter',
  version: '1.0.0',
  location: '/extensions/linter',
  manifest: {
    name: 'linter',
    publisher: 'publisher',
    version: '1.0.0',
    contributes: {
      configuration: {
        title: 'Linter Settings',
        properties: {
          'linter.enable': {
            type: 'boolean',
            default: true,
            description: 'Enable background linting',
          },
          'linter.maxProblems': {
            type: 'number',
            default: 100,
            description: 'Maximum problems to report',
          },
          'linter.rulesPath': {
            type: 'string',
            default: '.eslintrc.json',
            description: 'Path to rules configuration file',
          },
        },
      },
    },
  },
};

test('Extension configurations are stored, retrieved, and updated in useExtensionHostStore', () => {
  useExtensionHostStore.setState({
    installedExtensions: [configExt],
    configurations: {},
  });

  const store = useExtensionHostStore.getState();

  // Initial default value lookup
  assert.equal(store.getConfiguration('linter.enable', true), true);
  assert.equal(store.getConfiguration('linter.maxProblems', 100), 100);

  // Update configuration values
  store.updateConfiguration('linter.enable', false);
  store.updateConfiguration('linter.maxProblems', 250);
  store.updateConfiguration('linter.rulesPath', './custom-rules.json');

  // Verify updated state
  const updated = useExtensionHostStore.getState();
  assert.equal(updated.getConfiguration('linter.enable'), false);
  assert.equal(updated.getConfiguration('linter.maxProblems'), 250);
  assert.equal(updated.getConfiguration('linter.rulesPath'), './custom-rules.json');
});

test('getContributedConfigurations returns schemas from all installed extensions', () => {
  useExtensionHostStore.setState({
    installedExtensions: [configExt],
  });

  const configs = useExtensionHostStore.getState().getContributedConfigurations();
  assert.equal(configs.length, 1);
  assert.equal(configs[0].extensionId, 'publisher.linter');
  assert.equal(configs[0].title, 'Linter Settings');
  assert.ok(configs[0].properties['linter.enable']);
  assert.equal(configs[0].properties['linter.enable'].type, 'boolean');
});
