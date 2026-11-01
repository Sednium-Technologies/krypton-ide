import test from 'node:test';
import assert from 'node:assert';
import { useAuthStore } from '../src/store/useAuthStore';
import {
  setDriveAccessToken,
  getDriveAccessToken,
  clearDriveAccessToken,
  syncUpToDrive,
  syncDownFromDrive,
  getLastSyncInfo,
  hasCloudBackup
} from '../src/lib/googleDriveSync';

test('googleDriveSync manages in-memory access token lifecycle', () => {
  clearDriveAccessToken();
  assert.strictEqual(getDriveAccessToken(), null);

  const sampleToken = 'ya29.test-sample-oauth2-access-token';
  setDriveAccessToken(sampleToken);
  assert.strictEqual(getDriveAccessToken(), sampleToken);

  clearDriveAccessToken();
  assert.strictEqual(getDriveAccessToken(), null);
});

test('googleDriveSync returns unauthenticated status when token is missing', async () => {
  clearDriveAccessToken();
  
  const uploadResult = await syncUpToDrive();
  assert.strictEqual(uploadResult.success, false);
  assert.strictEqual(uploadResult.message, 'Not signed in to Google');

  const downloadResult = await syncDownFromDrive();
  assert.strictEqual(downloadResult.success, false);
  assert.strictEqual(downloadResult.message, 'Not signed in to Google');

  const lastSync = await getLastSyncInfo();
  assert.strictEqual(lastSync, null);

  const hasBackup = await hasCloudBackup();
  assert.strictEqual(hasBackup, false);
});

test('useAuthStore manages google authentication state and synchronizes with drive access token', () => {
  const store = useAuthStore.getState();
  
  const mockUser = {
    name: 'Test Coder',
    email: 'coder@sednium.com',
    picture: 'https://example.com/avatar.png'
  };
  const mockToken = 'mock-google-access-token-12345';

  store.setGoogleAuth(mockUser, mockToken);

  const current = useAuthStore.getState();
  assert.deepStrictEqual(current.googleUser, mockUser);
  assert.strictEqual(current.googleAccessToken, mockToken);
  assert.strictEqual(getDriveAccessToken(), mockToken);

  // Clear google auth
  store.clearGoogle();
  const cleared = useAuthStore.getState();
  assert.strictEqual(cleared.googleUser, null);
  assert.strictEqual(cleared.googleAccessToken, null);
  assert.strictEqual(getDriveAccessToken(), null);
});
