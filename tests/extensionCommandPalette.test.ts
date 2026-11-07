import test from 'node:test';
import assert from 'node:assert/strict';
import { useExtensionHostStore } from '../src/store/useExtensionHostStore';
import { registerWebMockCommand } from '../src/lib/extensions/nativeExtensionHost';
import type { InstalledExtension } from '../src/lib/extensions/nativeExtensionHost';

const sampleExt: InstalledExtension = {
  id: 'publisher.math-tools',
  version: '1.2.0',
  location: '/extensions/math-tools',
  manifest: {
    name: 'math-tools',
    publisher: 'publisher',
    version: '1.2.0',
    displayName: 'Math Tools Extension',
    activationEvents: ['onCommand:math.double'],
    contributes: {
      commands: [
        {
          command: 'math.double',
          title: 'Double Number',
          category: 'Math',
        },
        {
          command: 'math.echo',
          title: 'Echo Message',
          category: 'Math',
        },
      ],
    },
  },
};

test('useExtensionHostStore exposes contributed commands from installed extensions', () => {
  useExtensionHostStore.setState({
    installedExtensions: [sampleExt],
    activeExtensions: {},
    registeredCommands: [],
  });

  const commands = useExtensionHostStore.getState().getContributedCommands();
  assert.equal(commands.length, 2);
  assert.equal(commands[0].command, 'math.double');
  assert.equal(commands[0].title, 'Double Number');
  assert.equal(commands[0].category, 'Math');
  assert.equal(commands[0].extensionId, 'publisher.math-tools');
});

test('Executing a contributed command auto-activates extension if not yet active', async () => {
  useExtensionHostStore.setState({
    installedExtensions: [sampleExt],
    activeExtensions: {},
    registeredCommands: [],
  });

  registerWebMockCommand('math.double', (val: number) => (Number(val) || 0) * 2);

  assert.equal(useExtensionHostStore.getState().activeExtensions['publisher.math-tools'], undefined);

  // Executing command auto-activates the extension
  const res = await useExtensionHostStore.getState().executeCommand<number>('math.double', [21]);
  assert.equal(res, 42);

  // Extension should now be active
  assert.equal(
    useExtensionHostStore.getState().activeExtensions['publisher.math-tools'],
    'active'
  );
});
