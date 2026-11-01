import React, { useState, useCallback } from 'react';
import { FolderOpen, ArrowRight, Sparkles, Edit3 } from 'lucide-react';
import { initializeStorage, migrateFromLocalStorage } from '../../lib/fileSystemStorage';
import { PermissionConsentModal } from './PermissionConsentModal';

interface FolderPickerProps {
  onComplete: () => void;
}

export function FolderPicker({ onComplete }: FolderPickerProps) {
  const [selectedPath, setSelectedPath] = useState('KryptonIDE');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [showContent, setShowContent] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(true);

  React.useEffect(() => {
    const t = setTimeout(() => setShowContent(true), 100);
    return () => clearTimeout(t);
  }, []);

  const handleSelectFolder = () => {
    setIsEditing(true);
  };

  const handleContinue = async () => {
    const folderPath = selectedPath.trim();

    if (!folderPath) {
      setError('Please enter a folder name');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      await initializeStorage(folderPath);
      await migrateFromLocalStorage();
      onComplete();
    } catch (e: any) {
      console.error('Storage init error:', e);
      setError(e.message || 'Failed to initialize storage. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleConsentGranted = useCallback(async () => {
    setShowConsentModal(false);
    const folderPath = selectedPath.trim() || 'KryptonIDE';
    setIsCreating(true);
    setError('');

    // Retry up to 4 times with 600ms delay — Android 11+ has a brief OS-level
    // lag before Environment.isExternalStorageManager() reflects the newly-granted
    // "All Files Access" permission.
    const MAX_ATTEMPTS = 4;
    let lastError: any = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        await initializeStorage(folderPath);
        await migrateFromLocalStorage();
        onComplete();
        return;
      } catch (e: any) {
        lastError = e;
        console.warn(`[FolderPicker] initializeStorage attempt ${attempt + 1} failed:`, e);
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise(r => setTimeout(r, 600));
        }
      }
    }

    // All retries exhausted — surface a clear message
    setIsCreating(false);
    setError(
      lastError?.message ||
      'Storage could not be initialized. Please ensure "All files access" is enabled for KryptonIDE in Settings, then tap Continue.'
    );
  }, [selectedPath, onComplete]);

  return (
    <div className="fixed inset-0 z-[200] bg-[#2a2529] text-[#f3f0e7] flex flex-col items-center justify-center px-8 overflow-hidden">
      <PermissionConsentModal
        isOpen={showConsentModal}
        onConsent={handleConsentGranted}
      />
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-[#f3f0e7]/[0.03] blur-[120px]" />
      </div>

      <div className={`relative flex flex-col items-center max-w-md w-full transition-all duration-700 ease-out ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        <div className="mb-8">
          <div className="relative">
            <div className="absolute inset-0 bg-[#f3f0e7]/10 blur-2xl rounded-3xl animate-pulse-glow" />
            <div className="relative w-24 h-24 rounded-[1.75rem] bg-[#f3f0e7] flex items-center justify-center shadow-2xl shadow-black/40 border border-[#f3f0e7]/10">
              <FolderOpen size={40} className="text-[#2a2529]" />
            </div>
          </div>
        </div>

        <h1 className="text-3xl font-extrabold text-[#f3f0e7] mb-2 tracking-tight text-center">
          Storage Location
        </h1>
        <p className="text-[#f3f0e7]/60 text-base mb-8 text-center leading-relaxed max-w-[320px]">
          Select where your projects will be stored on your device.
        </p>

        <div className="w-full bg-[#32303a]/80 backdrop-blur-xl border border-[#f3f0e7]/10 rounded-2xl p-4 mb-4">
          <div className="text-[11px] text-[#f3f0e7]/50 uppercase tracking-wider font-semibold mb-2">
            Target Directory
          </div>
          {isEditing ? (
            <div className="flex items-center space-x-2">
              <span className="text-[#f3f0e7]/40 text-sm font-mono truncate">/storage/emulated/0/</span>
              <input
                autoFocus
                value={selectedPath}
                onChange={(e) => { setSelectedPath(e.target.value); setError(''); }}
                onBlur={() => { if (selectedPath.trim()) setIsEditing(false); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && selectedPath.trim()) setIsEditing(false); }}
                placeholder="KryptonIDE"
                className="flex-1 bg-[#2a2529] border border-[#f3f0e7]/50 rounded-lg px-3 py-2 text-[#f3f0e7] text-sm font-mono font-bold focus:outline-none"
              />
            </div>
          ) : (
            <div className="flex items-center space-x-2 text-sm font-mono">
              <span className="text-[#f3f0e7]/40 truncate">/storage/emulated/0/</span>
              <span className="text-[#f3f0e7] font-bold truncate">{selectedPath || 'KryptonIDE'}</span>
              <span className="text-[#f3f0e7]/40">/</span>
            </div>
          )}
        </div>

        <button
          onClick={handleSelectFolder}
          className="w-full flex items-center justify-center space-x-2 py-3.5 rounded-2xl font-bold text-base bg-[#32303a] border border-[#f3f0e7]/10 text-[#f3f0e7] hover:bg-[#3a3844] mb-3 transition-colors"
        >
          <Edit3 size={18} className="text-[#f3f0e7]" />
          <span>{isEditing ? 'Editing...' : 'Change Directory Name'}</span>
        </button>

        {error && (
          <p className="text-red-400 text-sm mb-3 text-center">{error}</p>
        )}

        <div className="flex items-center space-x-2 bg-[#f3f0e7]/10 border border-[#f3f0e7]/20 rounded-xl px-4 py-2.5 mb-6 w-full">
          <Sparkles size={14} className="text-[#f3f0e7] flex-shrink-0" />
          <span className="text-[12px] text-[#f3f0e7]/80 leading-snug">
            Files remain standard device files accessible via any file manager.
          </span>
        </div>

        <button
          onClick={handleContinue}
          disabled={isCreating || !selectedPath.trim()}
          className="w-full flex items-center justify-center space-x-2 py-4 rounded-2xl font-bold text-lg bg-[#f3f0e7] text-[#2a2529] shadow-xl shadow-[#f3f0e7]/10 hover:bg-white active:scale-[0.97] transition-all disabled:opacity-60"
        >
          {isCreating ? (
            <div className="w-5 h-5 border-2 border-[#2a2529] border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <span>Continue</span>
              <ArrowRight size={20} />
            </>
          )}
        </button>

        <p className="text-[#f3f0e7]/40 text-[11px] mt-6 text-center">
          You can update this setting at any time.
        </p>
      </div>
    </div>
  );
}
