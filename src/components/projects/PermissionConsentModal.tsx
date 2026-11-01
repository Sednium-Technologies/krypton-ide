import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, FolderOpen, Bot, Lock, ArrowRight, Sparkles, LogIn, Check } from 'lucide-react';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { useAuthStore } from '../../store/useAuthStore';
import { checkStoragePermission, requestStoragePermission } from '../../lib/storagePermission';

interface PermissionConsentModalProps {
  isOpen: boolean;
  onConsent: () => void;
}

export function PermissionConsentModal({ isOpen, onConsent }: PermissionConsentModalProps) {
  const { googleUser, setGoogleAuth, setGoogleUser } = useAuthStore();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRequestingPerm, setIsRequestingPerm] = useState(false);
  const [googleLoginError, setGoogleLoginError] = useState<string | null>(null);

  const hasConsentedRef = React.useRef(false);

  useEffect(() => {
    if (isOpen && !hasConsentedRef.current) {
      if (!Capacitor.isNativePlatform()) {
        hasConsentedRef.current = true;
        onConsent();
      } else {
        checkStoragePermission().then(granted => {
          if (granted && !hasConsentedRef.current) {
            hasConsentedRef.current = true;
            onConsent();
          }
        });
      }
    }
  }, [isOpen, onConsent]);

  // Re-check permission when user returns from Android Settings
  useEffect(() => {
    if (!isOpen) return;

    let isSubscribed = true;

    const handleResume = async () => {
      if (!Capacitor.isNativePlatform() || !isSubscribed) return;
      try {
        const granted = await checkStoragePermission();
        if (granted && isSubscribed) {
          onConsent();
        }
      } catch (e) {
        console.warn('[PermissionConsentModal] handleResume check error:', e);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') handleResume();
    };

    const appStateSub = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) handleResume();
    });

    document.addEventListener('visibilitychange', handleVisibility);
    document.addEventListener('resume', handleResume);
    window.addEventListener('focus', handleResume);

    // Active 1s polling interval as an ultimate safety net while modal is open
    const pollTimer = setInterval(handleResume, 1000);

    return () => {
      isSubscribed = false;
      clearInterval(pollTimer);
      appStateSub.then(sub => sub.remove()).catch(() => {});
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('resume', handleResume);
      window.removeEventListener('focus', handleResume);
    };
  }, [isOpen, onConsent]);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setGoogleLoginError(null);
    try {
      if (Capacitor.isNativePlatform()) {
        const result = await FirebaseAuthentication.signInWithGoogle({
          scopes: ['https://www.googleapis.com/auth/drive.appdata'],
        } as any);
        if (result.user) {
          const user = {
            name: result.user.displayName || 'Google User',
            email: result.user.email || '',
            picture: result.user.photoUrl || '',
          };
          const accessToken = (result as any).credential?.accessToken || '';
          setGoogleAuth(user, accessToken);
        } else {
          setGoogleLoginError('Sign-in cancelled.');
        }
      } else {
        // Fallback for web demo
        setGoogleUser({
          name: 'Developer Account',
          email: 'dev@kryptonide.internal',
          picture: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80',
        });
      }
    } catch (e: any) {
      console.warn('[PermissionConsentModal] Google Sign-In error:', e);
      const msg: string = e?.message || String(e) || '';
      if (msg.toLowerCase().includes('cancelled') || msg.toLowerCase().includes('canceled') || msg.includes('12501')) {
        setGoogleLoginError('Sign-in cancelled. You can skip this and sign in later from Settings.');
      } else if (msg.includes('10') || msg.toLowerCase().includes('developer_error') || msg.toLowerCase().includes('oauth')) {
        setGoogleLoginError('Google Sign-In is not configured yet. Skip for now — it\'s optional.');
      } else {
        setGoogleLoginError('Sign-in failed. This feature is optional — you can skip it.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };


  const handleGrantAccess = async () => {
    setIsRequestingPerm(true);
    try {
      const granted = await requestStoragePermission();
      if (granted) {
        onConsent();
        return;
      }
      // Plugin couldn't open settings — try direct Android intent URL
      // This opens ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION
      try {
        window.open(
          `intent:#Intent;action=android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION;data=package:com.sednium.kryptonide;end`,
          '_system'
        );
      } catch {
        // Last resort: open generic All Files Access list
        try {
          window.open(
            `intent:#Intent;action=android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION;end`,
            '_system'
          );
        } catch { /* silent */ }
      }
      // Spinner off — user needs to act in Settings then come back.
      // The 1s poll in useEffect will detect permission via filesystem probe.
    } catch (e) {
      console.warn('[PermissionConsentModal] Storage permission request failed:', e);
    } finally {
      setIsRequestingPerm(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[300] bg-[#2a2529] text-[#f3f0e7] flex items-center justify-center p-6 overflow-y-auto overflow-x-hidden select-none">
        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] rounded-full bg-[#f3f0e7]/[0.04] blur-[140px]" />
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ type: 'spring', stiffness: 360, damping: 34 }}
          style={{ willChange: 'transform, opacity', wordBreak: 'break-word', overflowWrap: 'anywhere' }}
          className="relative max-w-lg w-full bg-[#32303a]/90 backdrop-blur-2xl border border-[#f3f0e7]/15 rounded-[28px] p-6 md:p-8 shadow-[0_24px_70px_rgba(0,0,0,0.6)] flex flex-col text-left max-h-[90vh] overflow-y-auto overflow-x-hidden scrollbar-hide"
        >
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-[#f3f0e7] text-[#2a2529] flex items-center justify-center shadow-lg flex-shrink-0">
              <ShieldCheck size={26} />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-[#f3f0e7] tracking-tight">
                Data & Storage Privacy
              </h2>
              <p className="text-xs text-[#f3f0e7]/60">
                KryptonIDE setup & permissions
              </p>
            </div>
          </div>

          <p className="text-sm text-[#f3f0e7]/80 mb-5 leading-relaxed">
            Before granting storage permissions, here is how KryptonIDE uses your device storage:
          </p>

          <div className="space-y-3 mb-6">
            <div className="flex items-start space-x-3 bg-[#2a2529]/70 border border-[#f3f0e7]/10 p-3.5 rounded-2xl">
              <div className="p-2 bg-[#f3f0e7]/10 rounded-xl text-[#f3f0e7] flex-shrink-0 mt-0.5">
                <FolderOpen size={18} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-[#f3f0e7] mb-0.5">Project Storage Location</h4>
                <p className="text-[11px] text-[#f3f0e7]/60 leading-relaxed">
                  Your code and projects are saved directly into the <code className="text-[#f3f0e7] bg-[#f3f0e7]/10 px-1 py-0.5 rounded font-mono">KryptonIDE</code> folder on your device.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 bg-[#2a2529]/70 border border-[#f3f0e7]/10 p-3.5 rounded-2xl">
              <div className="p-2 bg-[#f3f0e7]/10 rounded-xl text-[#f3f0e7] flex-shrink-0 mt-0.5">
                <Bot size={18} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-[#f3f0e7] mb-0.5">AI Agent Skills & Contexts</h4>
                <p className="text-[11px] text-[#f3f0e7]/60 leading-relaxed">
                  Stores Agent Skills (<code className="text-[#f3f0e7] bg-[#f3f0e7]/10 px-1 py-0.5 rounded font-mono">skills/</code>) and chat histories (<code className="text-[#f3f0e7] bg-[#f3f0e7]/10 px-1 py-0.5 rounded font-mono">.contexts/</code>) locally. Tag skills with <span className="text-[#f3f0e7] font-semibold">/</span> or files with <span className="text-[#f3f0e7] font-semibold">@</span>.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 bg-[#2a2529]/70 border border-[#f3f0e7]/10 p-3.5 rounded-2xl">
              <div className="p-2 bg-[#f3f0e7]/10 rounded-xl text-[#f3f0e7] flex-shrink-0 mt-0.5">
                <Lock size={18} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-[#f3f0e7] mb-0.5">100% On-Device Privacy</h4>
                <p className="text-[11px] text-[#f3f0e7]/60 leading-relaxed">
                  No telemetry or tracking. Code and API keys remain 100% local to your device.
                </p>
              </div>
            </div>
          </div>

          {/* Optional Google Login Section */}
          <div className="bg-[#2a2529]/90 border border-[#f3f0e7]/15 p-4 rounded-2xl mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-[#f3f0e7]">
                  <LogIn size={18} />
                </div>
                <div>
                  <div className="flex items-center space-x-1.5">
                    <h4 className="text-xs font-bold text-[#f3f0e7]">Google Login</h4>
                    <span className="text-[9px] uppercase tracking-wider bg-[#f3f0e7]/15 text-[#f3f0e7]/70 px-1.5 py-0.5 rounded font-semibold">Optional</span>
                  </div>
                  <p className="text-[11px] text-[#f3f0e7]/50 mt-0.5">Sync projects &amp; Drive cloud backups</p>
                </div>
              </div>

              {googleUser ? (
                <div className="flex items-center space-x-1.5 text-xs text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
                  <Check size={14} />
                  <span>Signed In</span>
                </div>
              ) : (
                <button
                  onClick={handleGoogleLogin}
                  disabled={isLoggingIn}
                  className="px-3.5 py-2 rounded-xl bg-[#f3f0e7] text-[#2a2529] font-bold text-xs hover:bg-white active:scale-95 transition-all shadow-md flex items-center space-x-1.5 flex-shrink-0"
                >
                  {isLoggingIn ? (
                    <div className="w-3.5 h-3.5 border-2 border-[#2a2529] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span>Sign In</span>
                  )}
                </button>
              )}
            </div>

            {/* Inline error + skip */}
            {googleLoginError && !googleUser && (
              <div className="mt-3 flex items-start justify-between space-x-2">
                <p className="text-[11px] text-amber-400/90 leading-snug flex-1">{googleLoginError}</p>
                <button
                  onClick={() => setGoogleLoginError(null)}
                  className="text-[11px] text-[#f3f0e7]/50 underline underline-offset-2 flex-shrink-0 hover:text-[#f3f0e7]/80 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>



          <div className="flex items-center space-x-2 bg-[#f3f0e7]/10 border border-[#f3f0e7]/20 rounded-xl px-4 py-2.5 mb-6">
            <Sparkles size={14} className="text-[#f3f0e7] flex-shrink-0" />
            <span className="text-[11px] text-[#f3f0e7]/80 leading-snug">
              Key highlight: Full support for custom Agent Skills and file tagging context.
            </span>
          </div>

          <button
            onClick={handleGrantAccess}
            disabled={isRequestingPerm}
            className="w-full flex items-center justify-center space-x-2 py-4 rounded-2xl font-bold text-base bg-[#f3f0e7] text-[#2a2529] shadow-xl shadow-[#f3f0e7]/10 hover:bg-white active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {isRequestingPerm ? (
              <div className="w-5 h-5 border-2 border-[#2a2529] border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>I Understand, Grant Access</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
