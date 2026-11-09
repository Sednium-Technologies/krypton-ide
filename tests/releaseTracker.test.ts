import test from 'node:test';
import assert from 'node:assert';
import { compareVersions, isNewerVersion } from '../src/lib/releaseTracker';

test('compareVersions handles prefixes, gaps, and prereleases', () => {
  assert.strictEqual(compareVersions('v4.1.0', '4.0.0'), 1);
  assert.strictEqual(compareVersions('4.0.0', 'v4.0.0'), 0);
  assert.strictEqual(compareVersions('4.0', '4.0.1'), -1);
  assert.strictEqual(compareVersions('4.0.0', '4.0.0-beta.1'), 1);
  assert.strictEqual(compareVersions('4.0.0-beta.2', '4.0.0-beta.10'), -1);
});

test('isNewerVersion rejects the installed version and older tags', () => {
  assert.strictEqual(isNewerVersion('v5.0.0', '4.0.0'), true);
  assert.strictEqual(isNewerVersion('4.0.0', '4.0.0'), false);
  assert.strictEqual(isNewerVersion('v3.0.0', '4.0.0'), false);
});
