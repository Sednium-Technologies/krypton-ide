import test from 'node:test';
import assert from 'node:assert/strict';
import { useExtensionHostStore } from '../src/store/useExtensionHostStore';
import { useIdeStore } from '../src/store/useIdeStore';
import type { InstalledExtension } from '../src/lib/extensions/nativeExtensionHost';

const sampleHostExtension: InstalledExtension = {
  id: 'publisher.sample-panel-ext',
  version: '2.1.0',
  location: '/extensions/publisher.sample-panel-ext-2.1.0',
  manifest: {
    name: 'sample-panel-ext',
    publisher: 'publisher',
    version: '2.1.0',
    displayName: 'Sample Panel Extension',
    activationEvents: ['onCommand:sample.runAction'],
    contributes: {
      viewsContainers: {
        activitybar: [
          {
            id: 'sample-container',
            title: 'Sample Container',
            icon: 'icon.svg',
          },
        ],
      },
      views: {
        'sample-container': [
          {
            id: 'sample.primaryView',
            name: 'Primary Contributed View',
          },
          {
            id: 'sample.secondaryView',
            name: 'Secondary Contributed View',
          },
        ],
      },
      commands: [
        {
          command: 'sample.runAction',
          title: 'Run Sample Action',
          category: 'Sample',
        },
      ],
    },
  },
};

test('Host extension views and commands are resolved for active extension container', async () => {
  // Set up store state
  useExtensionHostStore.setState({
    installedExtensions: [sampleHostExtension],
    activeExtensions: {},
    registeredCommands: ['sample.runAction'],
  });

  useIdeStore.setState({
    sidebarView: 'extension-view',
    isSidebarOpen: true,
    activeExtensionView: {
      extensionId: 'publisher.sample-panel-ext',
      viewContainerId: 'sample-container',
      title: 'Sample Container',
      icon: 'icon.svg',
      toolId: 'ext-publisher.sample-panel-ext-sample-container',
    },
  });

  const activeView = useIdeStore.getState().activeExtensionView;
  assert.ok(activeView);
  assert.equal(activeView.extensionId, 'publisher.sample-panel-ext');

  // Verify host extension lookup
  const hostExt = useExtensionHostStore.getState().installedExtensions.find(
    (e) => e.id === activeView.extensionId
  );
  assert.ok(hostExt);
  assert.equal(hostExt.manifest.name, 'sample-panel-ext');

  // Verify view container mapping
  const views = hostExt.manifest.contributes?.views?.[activeView.viewContainerId] || [];
  assert.equal(views.length, 2);
  assert.equal(views[0].name, 'Primary Contributed View');
  assert.equal(views[1].name, 'Secondary Contributed View');

  // Verify command execution
  const cmd = hostExt.manifest.contributes?.commands?.[0];
  assert.ok(cmd);
  assert.equal(cmd.command, 'sample.runAction');

  const res = await useExtensionHostStore.getState().executeCommand(cmd.command);
  assert.ok(res !== undefined);
});
