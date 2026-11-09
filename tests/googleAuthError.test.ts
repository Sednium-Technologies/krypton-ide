import test from 'node:test';
import assert from 'node:assert';
import { describeGoogleAuthError } from '../src/lib/googleAuthError';

test('Google DEVELOPER_ERROR is reported as configuration, not a network problem', () => {
  const result = describeGoogleAuthError({ code: '10', message: '10: Developer error' });
  assert.strictEqual(result.isCancelled, false);
  assert.match(result.message, /misconfigured/i);
  assert.match(result.message, /SHA-1/i);
  assert.doesNotMatch(result.message, /internet connection/i);
});

test('Google cancellation codes are treated as cancellations', () => {
  for (const error of [
    { code: '12501', message: 'Sign in cancelled' },
    { code: 'auth/popup-closed-by-user', message: 'Popup closed' },
    new Error('The user cancelled the sign-in flow'),
  ]) {
    const result = describeGoogleAuthError(error);
    assert.strictEqual(result.isCancelled, true);
  }
});

test('Google network failures retain a network-specific message', () => {
  const result = describeGoogleAuthError({ code: '7', message: 'Network error' });
  assert.strictEqual(result.isCancelled, false);
  assert.match(result.message, /could not reach Google/i);
});

test('Credential Manager account errors are actionable', () => {
  const result = describeGoogleAuthError(new Error('No credentials available in Credential Manager'));
  assert.match(result.message, /Add a Google account/i);
});

test('Firebase provider configuration errors are explained', () => {
  const result = describeGoogleAuthError(new Error('auth/operation-not-allowed'));
  assert.match(result.message, /disabled for this Firebase project/i);
});

test('Unknown errors retain the code and technical detail', () => {
  const result = describeGoogleAuthError({ code: 'SOMETHING_ELSE', message: 'Unexpected failure' });
  assert.match(result.message, /SOMETHING_ELSE/);
  assert.match(result.technical, /Unexpected failure/);
});
