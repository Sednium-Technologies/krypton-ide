import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { isCredentialManagerUnavailableError } from './googleAuthError';

export const DEFAULT_GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.file',
];

export interface GoogleSignInOptions {
  scopes?: string[];
  useCredentialManager?: boolean;
}

export interface GoogleAuthUser {
  name: string;
  email: string;
  picture: string;
}

export interface GoogleAuthSuccessResult {
  user: GoogleAuthUser;
  accessToken: string;
  idToken?: string;
}

export interface GoogleAuthNativeClient {
  signInWithGoogle(options: { scopes: string[]; useCredentialManager: boolean }): Promise<any>;
}

let activeGoogleAuthClient: GoogleAuthNativeClient = {
  signInWithGoogle: (options) => FirebaseAuthentication.signInWithGoogle(options as any),
};

export function setGoogleAuthClientForTesting(client: GoogleAuthNativeClient | null) {
  activeGoogleAuthClient = client || {
    signInWithGoogle: (options) => FirebaseAuthentication.signInWithGoogle(options as any),
  };
}

export async function nativeSignInWithGoogle(
  options?: GoogleSignInOptions
): Promise<GoogleAuthSuccessResult> {
  const scopes = options?.scopes || DEFAULT_GOOGLE_SCOPES;
  const useCredentialManager = options?.useCredentialManager ?? false;

  const performSignIn = async (useCredMgr: boolean) => {
    return await activeGoogleAuthClient.signInWithGoogle({
      scopes,
      useCredentialManager: useCredMgr,
    });
  };

  let response: any;
  if (useCredentialManager) {
    try {
      response = await performSignIn(true);
    } catch (err: unknown) {
      if (isCredentialManagerUnavailableError(err)) {
        console.warn(
          '[GoogleAuth] Credential Manager unavailable or failed, falling back to legacy Google Sign-In:',
          err
        );
        response = await performSignIn(false);
      } else {
        throw err;
      }
    }
  } else {
    response = await performSignIn(false);
  }

  const rawUser = response?.user;
  const user: GoogleAuthUser = {
    name: rawUser?.displayName || rawUser?.email || 'Google User',
    email: rawUser?.email || '',
    picture: rawUser?.photoUrl || rawUser?.photoURL || '',
  };
  const accessToken =
    response?.credential?.accessToken ||
    (response as any)?.accessToken ||
    '';
  const idToken =
    response?.credential?.idToken ||
    (response as any)?.idToken;

  return {
    user,
    accessToken,
    idToken,
  };
}

function loadGisScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window not available'));
  }
  if ((window as any).google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

async function signInWithGis(scopes: string[]): Promise<GoogleAuthSuccessResult> {
  await loadGisScript();
  const clientId =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID) ||
    '868874217528-ufcphc6a9eu8sfbm9urqlnm6ikv5h25v.apps.googleusercontent.com';

  const scopeString = Array.from(
    new Set([
      ...scopes,
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ])
  ).join(' ');

  return new Promise<GoogleAuthSuccessResult>((resolve, reject) => {
    const client = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: scopeString,
      callback: async (tokenResponse: any) => {
        if (tokenResponse?.error) {
          reject(new Error(tokenResponse.error_description || tokenResponse.error || 'GIS Error'));
          return;
        }
        const accessToken = tokenResponse.access_token || '';
        let user: GoogleAuthUser = {
          name: 'Google User',
          email: '',
          picture: '',
        };
        try {
          const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (profileRes.ok) {
            const profile = await profileRes.json();
            user = {
              name: profile?.name || profile?.email || 'Google User',
              email: profile?.email || '',
              picture: profile?.picture || '',
            };
          }
        } catch {
          // Keep default user
        }
        resolve({
          user,
          accessToken,
        });
      },
      error_callback: (err: any) => {
        reject(err || new Error('GIS request failed'));
      },
    });

    client.requestAccessToken({ prompt: 'consent' });
  });
}

export async function signInWithGoogle(
  options?: GoogleSignInOptions
): Promise<GoogleAuthSuccessResult> {
  if (Capacitor.isNativePlatform()) {
    return await nativeSignInWithGoogle(options);
  }

  const scopes = options?.scopes || DEFAULT_GOOGLE_SCOPES;
  try {
    const { auth: firebaseAuth, googleProvider } = await import('./firebase');
    for (const scope of scopes) {
      googleProvider.addScope(scope);
    }
    const { signInWithPopup, GoogleAuthProvider } = await import('firebase/auth');
    const result = await signInWithPopup(firebaseAuth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken || '';
    const idToken = credential?.idToken;
    const user: GoogleAuthUser = {
      name: result.user.displayName || result.user.email || 'Google User',
      email: result.user.email || '',
      picture: result.user.photoURL || '',
    };
    return {
      user,
      accessToken,
      idToken,
    };
  } catch (popupErr: any) {
    console.warn('Firebase signInWithPopup failed, attempting GIS fallback:', popupErr);
    return await signInWithGis(scopes);
  }
}
