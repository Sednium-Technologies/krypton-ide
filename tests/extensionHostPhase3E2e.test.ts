import test from 'node:test';
import assert from 'node:assert/strict';
import { useExtensionHostStore } from '../src/store/useExtensionHostStore';
import { useNavbarStore } from '../src/store/useNavbarStore';
import { useIdeStore } from '../src/store/useIdeStore';
import {
  registerWebMockCommand,
  setWebMockStatusBarItem,
  pushWebMockNotification,
} from '../src/lib/extensions/nativeExtensionHost';
import type { InstalledExtension } from '../src/lib/extensions/nativeExtensionHost';

const sampleUiExt: InstalledExtension = {
  id: 'krypton-test.sample-ui-ext',
  version: '1.0.0',
  location: '/extensions/krypton-test.sample-ui-ext-1.0.0',
  manifest: {
    name: 'sample-ui-ext',
    publisher: 'krypton-test',
    version: '1.0.0',
    displayName: 'Sample Cloud Extension',
    activationEvents: [
      'onCommand:sample.cloudDeploy',
      'onCommand:sample.cloudStatus',
      'onView:sample-cloud-view',
    ],
    contributes: {
      viewsContainers: {
        activitybar: [
          {
            id: 'sample-cloud-view',
            title: 'Sample Cloud',
            icon: 'cloud-icon.svg',
          },
        ],
      },
      views: {
        'sample-cloud-view': [
          {
            id: 'sample.cloudExplorer',
            name: 'Cloud Resources',
          },
        ],
      },
      commands: [
        {
          command: 'sample.cloudDeploy',
          title: 'Cloud: Deploy Active Project',
          category: 'Cloud',
        },
        {
          command: 'sample.cloudStatus',
          title: 'Cloud: Check Cluster Status',
          category: 'Cloud',
        },
      ],
      configuration: {
        title: 'Sample Cloud Configuration',
        properties: {
          'sampleCloud.region': {
            type: 'string',
            default: 'us-east-1',
            description: 'Primary deployment region',
          },
          'sampleCloud.autoDeploy': {
            type: 'boolean',
            default: false,
            description: 'Automatically deploy on git push',
          },
        },
      },
    },
  },
};

test('Phase 3 E2E: Full UI contributions lifecycle (Activity Bar, Views, Commands, Status Bar, Settings)', async () => {
  // 1. Reset all relevant stores
  useIdeStore.setState({
    sidebarView: 'explorer',
    isSidebarOpen: false,
    activeExtensionView: null,
  });
  useNavbarStore.getState().resetDefaults();
  useExtensionHostStore.setState({
    installedExtensions: [],
    activeExtensions: {},
    registeredCommands: [],
    notifications: [],
    statusBarItems: [],
    configurations: {},
  });

  // 2. Install extension into ExtensionHost store
  useExtensionHostStore.setState({
    installedExtensions: [sampleUiExt],
  });

  const toolId = `ext-${sampleUiExt.id}-sample-cloud-view`;

  // 3. Verify Activity Bar / More Section sync
  const navbar = useNavbarStore.getState();
  const tool = navbar.tools[toolId];
  assert.ok(tool, 'Contributed tool must be registered in navbar tools');
  assert.equal(tool.label, 'Sample Cloud');
  assert.equal(tool.isCustom, true);

  // User decision: extension tool appears in overflow / More section by default
  const isPinned = navbar.pinnedIds.slice(0, navbar.pinnedCount).includes(toolId);
  assert.equal(isPinned, false, 'Tool must be in unpinned More section by default');
  const inOverflow = navbar.pinnedIds.slice(navbar.pinnedCount).includes(toolId);
  assert.equal(inOverflow, true, 'Tool must be present in overflow list');

  // 4. User clicks tool in More / Navbar -> opens extension view container
  useNavbarStore.getState().executeTool(toolId);

  const ideState = useIdeStore.getState();
  assert.equal(ideState.isSidebarOpen, true);
  assert.equal(ideState.sidebarView, 'extension-view');
  assert.deepEqual(ideState.activeExtensionView, {
    extensionId: sampleUiExt.id,
    viewContainerId: 'sample-cloud-view',
    title: 'Sample Cloud',
    icon: 'cloud-icon.svg',
    toolId,
  });

  // 5. Verify Contributed Views mapping
  const hostExt = useExtensionHostStore.getState().installedExtensions.find((e) => e.id === sampleUiExt.id);
  const views = hostExt?.manifest?.contributes?.views?.['sample-cloud-view'] || [];
  assert.equal(views.length, 1);
  assert.equal(views[0].name, 'Cloud Resources');

  // 6. Verify Configuration Settings schema & updates
  const configs = useExtensionHostStore.getState().getContributedConfigurations();
  assert.equal(configs.length, 1);
  assert.equal(configs[0].title, 'Sample Cloud Configuration');
  assert.equal(useExtensionHostStore.getState().getConfiguration('sampleCloud.region'), 'us-east-1');

  useExtensionHostStore.getState().updateConfiguration('sampleCloud.region', 'eu-central-1');
  assert.equal(useExtensionHostStore.getState().getConfiguration('sampleCloud.region'), 'eu-central-1');

  // 7. Register simulated commands and status bar item in web test host
  registerWebMockCommand('sample.cloudDeploy', (targetEnv: string) => {
    const region = useExtensionHostStore.getState().getConfiguration('sampleCloud.region');
    return `Deployed to ${region} [${targetEnv || 'production'}]`;
  });

  registerWebMockCommand('sample.cloudStatus', () => ({ status: 'healthy', instances: 4 }));

  setWebMockStatusBarItem({
    id: 'sb_cloud',
    text: '$(cloud) Cloud Ready',
    tooltip: 'Click to inspect cloud cluster status',
    command: 'sample.cloudStatus',
    priority: 100,
    visible: true,
  });

  pushWebMockNotification({
    level: 'info',
    message: 'Sample Cloud Extension Activated',
    items: ['OK'],
  });

  // 8. Execute command from palette or UI (auto-activates extension)
  const deployResult = await useExtensionHostStore.getState().executeCommand<string>('sample.cloudDeploy', ['staging']);
  assert.equal(deployResult, 'Deployed to eu-central-1 [staging]');

  // Verify auto-activation
  assert.equal(useExtensionHostStore.getState().activeExtensions[sampleUiExt.id], 'active');

  // 9. Verify status bar item reflected in store
  const sbItems = await useExtensionHostStore.getState().refreshStatusBarItems();
  assert.equal(sbItems.length, 1);
  assert.equal(sbItems[0].text, '$(cloud) Cloud Ready');
  assert.equal(sbItems[0].command, 'sample.cloudStatus');

  // Clicking status bar item triggers bound command
  const statusResult = await useExtensionHostStore.getState().executeCommand<{ status: string; instances: number }>('sample.cloudStatus');
  assert.equal(statusResult.status, 'healthy');
  assert.equal(statusResult.instances, 4);

  // 10. Verify notification draining (drained during command execution)
  const notifications = useExtensionHostStore.getState().notifications;
  assert.ok(notifications.some((n) => n.message === 'Sample Cloud Extension Activated'));

  // 11. Uninstall extension
  useExtensionHostStore.setState({
    installedExtensions: [],
    activeExtensions: {},
  });

  // Navbar cleans up tool
  assert.equal(useNavbarStore.getState().tools[toolId], undefined);
  assert.equal(useNavbarStore.getState().pinnedIds.includes(toolId), false);
  assert.equal(useExtensionHostStore.getState().getContributedConfigurations().length, 0);
});
