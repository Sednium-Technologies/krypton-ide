export interface GoogleAuthErrorInfo {
  message: string;
  technical: string;
  code: string;
  isCancelled: boolean;
}

function safeString(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

export function describeGoogleAuthError(error: unknown): GoogleAuthErrorInfo {
  const err = error as any;
  const message = String(err?.message || err?.error || err || '').trim();
  const code = String(err?.code || err?.errorCode || err?.status || '').trim();
  const technical = [code, message].filter(Boolean).join(': ') || safeString(error) || 'No technical detail provided.';
  const haystack = `${code} ${message} ${safeString(error)}`.toLowerCase();

  const isCancelled =
    /12501|sign_in_cancelled|user_cancel|cancelled|canceled|closed_by_user|popup_closed|popup-closed-by-user|popup_closed_by_user|cancelled-popup-request/.test(haystack);

  const hasCode = (value: number | string) => {
    const normalized = String(value).toLowerCase();
    return code.toLowerCase() === normalized || new RegExp(`(^|\\D)${normalized}(\\D|$)`).test(haystack);
  };

  if (isCancelled) {
    return {
      message: 'Google Sign-In was cancelled. You can sign in later from Settings.',
      technical,
      code,
      isCancelled: true,
    };
  }

  if (
    hasCode(10) ||
    haystack.includes('developer_error') ||
    haystack.includes('api exception: 10') ||
    haystack.includes('apiexception: 10')
  ) {
    return {
      message:
        'Google Sign-In is misconfigured for this build (DEVELOPER_ERROR / code 10). The Android package name, signing certificate SHA-1, and Web client ID in google-services.json must match this app. This is not an internet or API-key problem.',
      technical,
      code: code || '10',
      isCancelled: false,
    };
  }

  if (hasCode(12500) || haystack.includes('sign_in_failed')) {
    return {
      message:
        'Google Sign-In could not start. Verify that Google sign-in is enabled in Firebase, and that the OAuth Web client matches this app package and signing certificate.',
      technical,
      code: code || '12500',
      isCancelled: false,
    };
  }

  if (hasCode(12502) || haystack.includes('sign_in_in_progress')) {
    return {
      message: 'Google Sign-In is already in progress. Wait for the current request to finish and try again.',
      technical,
      code: code || '12502',
      isCancelled: false,
    };
  }

  if (hasCode(7) || /network|timeout|unreachable|offline/.test(haystack)) {
    return {
      message: 'Google Sign-In could not reach Google. Check your connection and try again.',
      technical,
      code: code || '7',
      isCancelled: false,
    };
  }

  if (/no credentials|nocredential|credential manager|getcredential/.test(haystack)) {
    return {
      message:
        'No Google account is available to Credential Manager. Add a Google account in Android Settings, then try again.',
      technical,
      code,
      isCancelled: false,
    };
  }

  if (haystack.includes('auth/operation-not-allowed')) {
    return {
      message: 'Google sign-in is disabled for this Firebase project. Enable the Google provider in Firebase Authentication.',
      technical,
      code,
      isCancelled: false,
    };
  }

  if (haystack.includes('auth/unauthorized-domain')) {
    return {
      message: 'This domain is not authorized for Google sign-in in Firebase Authentication.',
      technical,
      code,
      isCancelled: false,
    };
  }

  if (/auth\/invalid-api-key|auth\/api-key-not-valid|api key not valid/.test(haystack)) {
    return {
      message: 'The Firebase API key is invalid for this build. Check the google-services.json configuration.',
      technical,
      code,
      isCancelled: false,
    };
  }

  if (/auth\/account-exists-with-different-credential|auth\/credential-already-in-use/.test(haystack)) {
    return {
      message: 'This email is already linked to a different sign-in method. Use the original sign-in method and try again.',
      technical,
      code,
      isCancelled: false,
    };
  }

  return {
    message: `Google Sign-In failed${code ? ` (${code})` : ''}. ${message || 'Please try again.'}`,
    technical,
    code,
    isCancelled: false,
  };
}
