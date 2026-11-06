import React, { useState, useEffect } from 'react';
import { useIdeStore } from '../../store/useIdeStore';
import { useProjectsStore } from '../../store/useProjectsStore';
import { useBuildStore } from '../../store/useBuildStore';
import { Package, Play, CheckCircle, XCircle, Loader2, Download, AlertCircle, Minimize2 } from 'lucide-react';
import { Capacitor, registerPlugin } from '@capacitor/core';

const ApkInstaller = registerPlugin<any>('ApkInstaller');

interface BuildPanelProps {
  onMinimize?: () => void;
}

export function BuildPanel({ onMinimize }: BuildPanelProps) {
  const { currentProjectId, projects } = useProjectsStore();
  const { buildStatus, runInfo, errorMsg, apkUri, startBuild, setApkUri } = useBuildStore();
  
  const project = currentProjectId ? projects[currentProjectId] : null;
  const isAndroidProject = project?.template?.startsWith('android-');

  const handleBuild = async () => {
    if (!project || !project.githubRepo) return;
    const [owner, repoName] = project.githubRepo.split('/');
    startBuild(currentProjectId!, owner, repoName);
  };

  const installApk = async () => {
    if (!apkUri) return;
    if (Capacitor.isNativePlatform()) {
      console.log("Install APK from", apkUri);
      try {
        await ApkInstaller.install({ path: apkUri });
      } catch (e: any) {
        console.error(e);
        alert('Could not open APK. You can find it at: ' + apkUri + '\nError: ' + e.message);
      }
    } else {
      alert('APK installation only works on native Android.\nURL: ' + apkUri);
    }
  };

  if (!isAndroidProject) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        <div className="text-center">
          <Package size={24} className="mx-auto mb-2 opacity-30" />
          <p>This panel is for Android projects</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] text-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#3c3c3c]">
        <h3 className="text-sm font-bold flex items-center space-x-2">
          <Package size={16} className="text-blue-400" />
          <span>Android Build Pipeline</span>
        </h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleBuild}
            disabled={buildStatus === 'pushing' || buildStatus === 'triggering' || buildStatus === 'building' || buildStatus === 'downloading'}
            className="flex items-center space-x-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold disabled:opacity-50 transition-colors"
          >
            {buildStatus === 'idle' || buildStatus === 'failed' || buildStatus === 'success' || buildStatus === 'success_downloaded' ? (
              <><Play size={14} /><span>Build APK</span></>
            ) : (
              <><Loader2 size={14} className="animate-spin" /><span>Processing...</span></>
            )}
          </button>
          {onMinimize && (
            <button 
              onClick={onMinimize}
              className="p-1.5 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
              title="Minimize to Background"
            >
              <Minimize2 size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="p-4 flex-1 overflow-y-auto space-y-4">
        {errorMsg && (
          <div className="p-3 bg-red-500/20 text-red-300 rounded border border-red-500/50 flex space-x-2 items-start text-xs">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="space-y-3 pl-2">
          <Step 
            status={getStatusState(buildStatus, ['pushing'], ['triggering', 'building', 'downloading', 'success', 'success_downloaded'], ['failed'])}
            label="Push code to GitHub"
          />
          <Step 
            status={getStatusState(buildStatus, ['triggering'], ['building', 'downloading', 'success', 'success_downloaded'], ['failed'])}
            label="Trigger GitHub Actions"
          />
          <Step 
            status={getStatusState(buildStatus, ['building'], ['downloading', 'success', 'success_downloaded'], ['failed'])}
            label="Compile APK in cloud"
            subLabel={runInfo ? `Status: ${runInfo.status}` : undefined}
          />
          <Step 
            status={getStatusState(buildStatus, ['downloading'], ['success_downloaded'], ['failed'])}
            label="Download APK artifact"
          />
        </div>

        {buildStatus === 'success_downloaded' && (
          <div className="mt-6 flex flex-col items-center justify-center p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
            <CheckCircle size={24} className="text-green-400 mb-2" />
            <h4 className="font-bold text-green-300 mb-1">Build Successful!</h4>
            <button 
              onClick={installApk}
              className="mt-3 flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow-lg"
            >
              <Download size={16} />
              <span>Install APK</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function getStatusState(
  current: string, 
  activeStates: string[], 
  completedStates: string[], 
  errorStates: string[]
): 'pending' | 'active' | 'completed' | 'error' {
  if (errorStates.includes(current) && !completedStates.includes(current)) return 'error';
  if (completedStates.includes(current)) return 'completed';
  if (activeStates.includes(current)) return 'active';
  return 'pending';
}

function Step({ status, label, subLabel }: { status: 'pending' | 'active' | 'completed' | 'error', label: string, subLabel?: string }) {
  let icon = <div className="w-5 h-5 rounded-full border-2 border-gray-600" />;
  if (status === 'active') icon = <Loader2 size={20} className="text-blue-400 animate-spin" />;
  if (status === 'completed') icon = <CheckCircle size={20} className="text-green-400" />;
  if (status === 'error') icon = <XCircle size={20} className="text-red-400" />;

  return (
    <div className={`flex items-start space-x-3 ${status === 'pending' ? 'opacity-50' : ''}`}>
      <div className="mt-0.5">{icon}</div>
      <div>
        <p className={`text-sm font-semibold ${status === 'active' ? 'text-blue-400' : status === 'completed' ? 'text-gray-200' : 'text-gray-400'}`}>
          {label}
        </p>
        {subLabel && <p className="text-xs text-gray-500">{subLabel}</p>}
      </div>
    </div>
  );
}
