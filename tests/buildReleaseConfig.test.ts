import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('BUG-BUILD-01: githubBuildService dispatches to build-android.yml', async () => {
  const servicePath = path.join(rootDir, 'src/lib/githubBuildService.ts');
  const content = fs.readFileSync(servicePath, 'utf8');

  // Verify that workflow dispatch points to build-android.yml
  assert.ok(
    content.includes('/actions/workflows/build-android.yml/dispatches'),
    'triggerBuild must dispatch to build-android.yml'
  );
  assert.ok(
    !content.includes('/actions/workflows/build.yml/dispatches'),
    'triggerBuild must NOT dispatch to obsolete build.yml'
  );
});

test('SEC-SIGN-01: capacitor.config.json keystoreAlias matches gradle and release keystore', () => {
  const configPath = path.join(rootDir, 'capacitor.config.json');
  assert.ok(fs.existsSync(configPath), 'capacitor.config.json must exist');

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.strictEqual(config.android?.buildOptions?.keystoreAlias, 'kryptonide');
  assert.strictEqual(config.android?.buildOptions?.keystorePath, 'release.keystore');
});

test('SEC-SIGN-01 & SEC-CI-01: build-android.yml passes secrets via env and uses kryptonide alias', () => {
  const workflowPath = path.join(rootDir, '.github/workflows/build-android.yml');
  assert.ok(fs.existsSync(workflowPath), '.github/workflows/build-android.yml must exist');

  const content = fs.readFileSync(workflowPath, 'utf8');

  // Verify Decode Android Keystore step uses env variables instead of inline shell secrets
  assert.ok(content.includes('KS_B64: ${{ secrets.KEYSTORE_BASE64 }}'), 'Keystore base64 must be passed via KS_B64 env');
  assert.ok(
    content.includes("KS_PASS: ${{ secrets.KEYSTORE_PASSWORD || 'android' }}"),
    'Keystore password must be passed via KS_PASS env'
  );

  // Verify no inlined ${{ secrets... }} in the shell script
  const decodeStepMatch = content.match(/Decode Android Keystore[\s\S]*?(?=- name:|$)/);
  assert.ok(decodeStepMatch, 'Decode Android Keystore step must be present');
  const decodeStep = decodeStepMatch[0];

  assert.ok(
    decodeStep.includes('echo "$KS_B64" | base64 --decode > android/app/release.keystore'),
    'Decode step must use $KS_B64 env variable'
  );
  assert.ok(
    decodeStep.includes('-alias kryptonide'),
    'Keytool fallback must use alias kryptonide'
  );
  assert.ok(
    decodeStep.includes('-storepass "$KS_PASS"'),
    'Keytool fallback must use $KS_PASS env variable'
  );
});

test('BUG-FILE-01: IdeLayout and FileExplorer use Capacitor.isNativePlatform for ZIP export', () => {
  const ideLayoutPath = path.join(rootDir, 'src/components/layout/IdeLayout.tsx');
  const fileExplorerPath = path.join(rootDir, 'src/components/sidebar/FileExplorer.tsx');

  const ideLayoutContent = fs.readFileSync(ideLayoutPath, 'utf8');
  const fileExplorerContent = fs.readFileSync(fileExplorerPath, 'utf8');

  // Check IdeLayout
  assert.ok(
    ideLayoutContent.includes('Capacitor.isNativePlatform()'),
    'IdeLayout must check Capacitor.isNativePlatform()'
  );
  assert.ok(
    ideLayoutContent.includes('Directory.Documents'),
    'IdeLayout must save ZIP to Directory.Documents on native'
  );
  assert.ok(
    ideLayoutContent.includes("type: 'base64'"),
    'IdeLayout must generate base64 ZIP for Filesystem.writeFile on native'
  );

  // Check FileExplorer
  assert.ok(
    fileExplorerContent.includes('Capacitor.isNativePlatform()'),
    'FileExplorer must check Capacitor.isNativePlatform()'
  );
  assert.ok(
    fileExplorerContent.includes('Directory.Documents'),
    'FileExplorer must save ZIP to Directory.Documents on native'
  );
  assert.ok(
    fileExplorerContent.includes("type: 'base64'"),
    'FileExplorer must generate base64 ZIP for Filesystem.writeFile on native'
  );
});
