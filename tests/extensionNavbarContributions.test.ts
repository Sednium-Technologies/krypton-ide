import test from 'node:test';
import assert from 'node:assert/strict';
import { useNavbarStore } from '../src/store/useNavbarStore';
import { useExtensionHostStore } from '../src/store/useExtensionHostStore';
import { useIdeStore } from '../src/store/useIdeStore';
import type { InstalledExtension } from '../src/lib/extensions/nativeExtensionHost';

function resetStores() {
  useIdeStore.setState({
    sidebarView: 'explorer',
    activeExtensionView: null,
    isSidebarOpen: false,
  });
  useExtensionHostStore.setState({
    installedExtensions: [],
    activeExtensions: {},
    registeredCommands: [],
    notifications: [],
    isLoading: false,
    error: null,
  });
  useNavbarStore.getState().resetDefaults();
  useNavbarStore.getState().syncExtensionTools();
}

const sampleExtension: InstalledExtension = {
  id: 'publisher.sample-ext',
  version: '1.0.0',
  location: '/extensions/publisher.sample-ext-1.0.0',
  manifest: {
    name: 'sample-ext',
    publisher: 'publisher',
    version: '1.0.0',
    displayName: 'Sample Tool Ext',
    icon: 'sample-icon.svg',
    contributes: {
      viewsContainers: {
        activitybar: [
          {
            id: 'sample-view-container',
            title: 'Sample Container',
            icon: 'container-icon.svg',
          },
        ],
      },
    },
  },
};

test('Installing/loading an extension with viewsContainers.activitybar registers the tool in useNavbarStore', () => {
  resetStores();

  const expectedToolId = `ext-${sampleExtension.id}-${sampleExtension.manifest.contributes!.viewsContainers!.activitybar![0].id}`;

  assert.equal(useNavbarStore.getState().tools[expectedToolId], undefined);

  // Load extension into useExtensionHostStore
  useExtensionHostStore.setState({
    installedExtensions: [sampleExtension],
  });

  const tool = useNavbarStore.getState().tools[expectedToolId];
  assert.ok(tool, 'Tool should be registered in useNavbarStore');
  assert.equal(tool.id, expectedToolId);
  assert.equal(tool.label, 'Sample Container');
  assert.equal(tool.isCustom, true);
  assert.equal(tool.extensionId, sampleExtension.id);
  assert.equal(tool.icon, 'container-icon.svg');
});

test('The contributed tool is unpinned by default (available in overflow / More section)', () => {
  resetStores();

  const expectedToolId = `ext-${sampleExtension.id}-${sampleExtension.manifest.contributes!.viewsContainers!.activitybar![0].id}`;

  useExtensionHostStore.setState({
    installedExtensions: [sampleExtension],
  });

  const state = useNavbarStore.getState();
  const pinnedCount = state.pinnedCount;
  const pinnedSlice = state.pinnedIds.slice(0, pinnedCount);
  const overflowSlice = state.pinnedIds.slice(pinnedCount);

  // Must not be pinned into primary activity bar slots
  assert.equal(
    pinnedSlice.includes(expectedToolId),
    false,
    'Contributed extension tool must not be pinned by default'
  );

  // Must be in overflow slice
  assert.equal(
    overflowSlice.includes(expectedToolId),
    true,
    'Contributed extension tool must be present in overflow / More section'
  );
});

test('Calling executeTool(toolId) invokes openExtensionView on useIdeStore', () => {
  resetStores();

  const expectedToolId = `ext-${sampleExtension.id}-${sampleExtension.manifest.contributes!.viewsContainers!.activitybar![0].id}`;

  useExtensionHostStore.setState({
    installedExtensions: [sampleExtension],
  });

  assert.equal(useIdeStore.getState().sidebarView, 'explorer');
  assert.equal(useIdeStore.getState().isSidebarOpen, false);
  assert.equal(useIdeStore.getState().activeExtensionView, null);

  // Execute tool
  useNavbarStore.getState().executeTool(expectedToolId);

  // Verify effect on useIdeStore
  const ideState = useIdeStore.getState();
  assert.equal(ideState.isSidebarOpen, true);
  assert.equal(ideState.sidebarView, 'extension-view');
  assert.deepEqual(ideState.activeExtensionView, {
    extensionId: sampleExtension.id,
    viewContainerId: 'sample-view-container',
    title: 'Sample Container',
    icon: 'container-icon.svg',
    toolId: expectedToolId,
  });

  assert.equal(useNavbarStore.getState().isToolActive(expectedToolId), true);
});

test('Removing or uninstalling the extension unregisters the custom tool and cleans pinnedIds', () => {
  resetStores();

  const expectedToolId = `ext-${sampleExtension.id}-${sampleExtension.manifest.contributes!.viewsContainers!.activitybar![0].id}`;

  useExtensionHostStore.setState({
    installedExtensions: [sampleExtension],
  });

  assert.ok(useNavbarStore.getState().tools[expectedToolId]);
  assert.ok(useNavbarStore.getState().pinnedIds.includes(expectedToolId));

  // Remove extension
  useExtensionHostStore.setState({
    installedExtensions: [],
  });

  const state = useNavbarStore.getState();
  assert.equal(state.tools[expectedToolId], undefined, 'Tool should be purged from tools');
  assert.equal(
    state.pinnedIds.includes(expectedToolId),
    false,
    'Tool ID should be purged from pinnedIds'
  );
});
