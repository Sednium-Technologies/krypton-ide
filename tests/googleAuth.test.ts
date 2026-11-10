import test from 'node:test';
import assert from 'node:assert';
import { isCredentialManagerUnavailableError } from '../src/lib/googleAuthError';
import {
  nativeSignInWithGoogle,
  DEFAULT_GOOGLE_SCOPES,
  setGoogleAuthClientForTesting,
} from '../src/lib/googleAuth';

test('isCredentialManagerUnavailableError detects NoCredentialException and account missing errors', () => {
  const credentialManagerErrors = [
    new Error('NoCredentialException: No credentials available'),
    new Error('No credentials available'),
    new Error('No account found in credential manager'),
    new Error('No credentials available in Credential Manager'),
    { code: '16', message: 'No credential available' },
    { code: '16' },
    { message: 'android.credentials.GetCredentialException.TYPE_NO_CREDENTIAL' },
    { message: 'getcredential failed' },
  ];

  for (const err of credentialManagerErrors) {
    assert.strictEqual(
      isCredentialManagerUnavailableError(err),
      true,
      `Expected ${JSON.stringify(err)} to be detected as Credential Manager unavailable`
    );
  }
});

test('isCredentialManagerUnavailableError rejects false positives (cancellations, developer error, network error)', () => {
  const nonCredentialErrors = [
    { code: '12501', message: 'Sign in cancelled' },
    { code: 'auth/popup-closed-by-user', message: 'Popup closed' },
    new Error('The user cancelled the sign-in flow'),
    { code: '10', message: '10: Developer error' },
    { message: 'DEVELOPER_ERROR' },
    { code: '7', message: 'Network error' },
    new Error('network timeout'),
    new Error('auth/operation-not-allowed'),
    { code: 'SOMETHING_ELSE', message: 'Unexpected failure' },
    null,
    undefined,
  ];

  for (const err of nonCredentialErrors) {
    assert.strictEqual(
      isCredentialManagerUnavailableError(err),
      false,
      `Expected ${JSON.stringify(err)} NOT to be detected as Credential Manager unavailable`
    );
  }
});

test('nativeSignInWithGoogle calls FirebaseAuthentication with useCredentialManager: false by default', async () => {
  const calls: any[] = [];
  setGoogleAuthClientForTesting({
    signInWithGoogle: async (options) => {
      calls.push(options);
      return {
        user: {
          displayName: 'Test User',
          email: 'test@example.com',
          photoUrl: 'https://example.com/avatar.png',
        },
        credential: {
          accessToken: 'mock-access-token',
          idToken: 'mock-id-token',
        },
      };
    },
  });

  try {
    const result = await nativeSignInWithGoogle();
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].useCredentialManager, false);
    assert.deepStrictEqual(calls[0].scopes, DEFAULT_GOOGLE_SCOPES);
    assert.strictEqual(result.user.name, 'Test User');
    assert.strictEqual(result.user.email, 'test@example.com');
    assert.strictEqual(result.accessToken, 'mock-access-token');
    assert.strictEqual(result.idToken, 'mock-id-token');
  } finally {
    setGoogleAuthClientForTesting(null);
  }
});

test('nativeSignInWithGoogle fallback logic: retries with useCredentialManager: false when true fails with Credential Manager error', async () => {
  const calls: any[] = [];
  setGoogleAuthClientForTesting({
    signInWithGoogle: async (options) => {
      calls.push(options);
      if (options.useCredentialManager === true) {
        throw new Error('NoCredentialException: No credentials available');
      }
      return {
        user: {
          displayName: 'Fallback User',
          email: 'fallback@example.com',
        },
        credential: {
          accessToken: 'fallback-token',
        },
      };
    },
  });

  try {
    const result = await nativeSignInWithGoogle({ useCredentialManager: true });
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[0].useCredentialManager, true);
    assert.strictEqual(calls[1].useCredentialManager, false);
    assert.strictEqual(result.user.name, 'Fallback User');
    assert.strictEqual(result.accessToken, 'fallback-token');
  } finally {
    setGoogleAuthClientForTesting(null);
  }
});

test('nativeSignInWithGoogle does not retry fallback on cancellations or developer errors', async () => {
  // Test cancellation (12501)
  let calls: any[] = [];
  setGoogleAuthClientForTesting({
    signInWithGoogle: async (options) => {
      calls.push(options);
      throw { code: '12501', message: 'Sign in cancelled' };
    },
  });

  try {
    await assert.rejects(
      async () => {
        await nativeSignInWithGoogle({ useCredentialManager: true });
      },
      (err: any) => {
        assert.strictEqual(err.code, '12501');
        return true;
      }
    );
    assert.strictEqual(calls.length, 1, 'Should not retry on cancellation');
  } finally {
    setGoogleAuthClientForTesting(null);
  }

  // Test DEVELOPER_ERROR (10)
  calls = [];
  setGoogleAuthClientForTesting({
    signInWithGoogle: async (options) => {
      calls.push(options);
      throw { code: '10', message: '10: Developer error' };
    },
  });

  try {
    await assert.rejects(
      async () => {
        await nativeSignInWithGoogle({ useCredentialManager: true });
      },
      (err: any) => {
        assert.strictEqual(err.code, '10');
        return true;
      }
    );
    assert.strictEqual(calls.length, 1, 'Should not retry on developer error');
  } finally {
    setGoogleAuthClientForTesting(null);
  }
});
