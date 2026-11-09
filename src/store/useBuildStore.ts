import { create } from 'zustand';
import { triggerBuild, getLatestRun, getRunArtifacts, downloadArtifactToDevice, WorkflowRun } from '../lib/githubBuildService';
import { pushProject } from '../lib/githubService';
import { buildAndroidApkLocally } from '../lib/localAndroidBuild';

export type BuildStatus = 'idle' | 'pushing' | 'triggering' | 'building' | 'downloading' | 'success' | 'success_downloaded' | 'failed';
export type BuildMode = 'cloud' | 'local';

interface BuildState {
  buildStatus: BuildStatus;
  runInfo: WorkflowRun | null;
  errorMsg: string | null;
  apkUri: string | null;
  projectId: string | null;
  buildMode: BuildMode;
  localLog: string | null;

  // Actions
  startBuild: (projectId: string, owner: string, repoName: string) => Promise<void>;
  startLocalBuild: (projectId: string, projectPath: string, variant?: 'debug' | 'release') => Promise<void>;
  pollStatus: (owner: string, repoName: string) => Promise<void>;
  reset: () => void;
  setApkUri: (uri: string | null) => void;
}

export const useBuildStore = create<BuildState>()((set, get) => ({
  buildStatus: 'idle',
  runInfo: null,
  errorMsg: null,
  apkUri: null,
  projectId: null,
  buildMode: 'cloud',
  localLog: null,

  reset: () => set({ buildStatus: 'idle', runInfo: null, errorMsg: null, apkUri: null, projectId: null, buildMode: 'cloud', localLog: null }),

  setApkUri: (uri: string | null) => set({ apkUri: uri }),

  startBuild: async (projectId: string, owner: string, repoName: string) => {
    set({ buildStatus: 'pushing', errorMsg: null, apkUri: null, projectId, buildMode: 'cloud', localLog: null });

    try {
      // 1. Push code
      await pushProject(owner, repoName);

      // 2. Trigger workflow
      set({ buildStatus: 'triggering' });
      await triggerBuild(owner, repoName, 'debug');

      // 3. Start building phase
      set({ buildStatus: 'building' });

      // Initial status check
      const run = await getLatestRun(owner, repoName);
      if (run) set({ runInfo: run });

    } catch (e: any) {
      set({ buildStatus: 'failed', errorMsg: e.message });
      throw e;
    }
  },

  startLocalBuild: async (projectId: string, projectPath: string, variant: 'debug' | 'release' = 'debug') => {
    set({
      buildStatus: 'building',
      buildMode: 'local',
      errorMsg: null,
      apkUri: null,
      projectId,
      localLog: 'Checking local Gradle toolchain...',
    });

    try {
      const result = await buildAndroidApkLocally(projectPath, variant, (line) => {
        set((state) => ({
          localLog: `${state.localLog || ''}\n${line}`.slice(-20000),
        }));
      });
      set({
        buildStatus: 'success_downloaded',
        apkUri: result.apkPath,
        localLog: `${get().localLog || ''}\nBuild complete: ${result.apkPath}`.slice(-20000),
      });
    } catch (e: any) {
      set({
        buildStatus: 'failed',
        errorMsg: e.message || 'Local build failed',
      });
      throw e;
    }
  },

  pollStatus: async (owner: string, repoName: string) => {
    const { buildStatus, runInfo } = get();
    if (buildStatus !== 'building') return;

    try {
      const run = await getLatestRun(owner, repoName);
      if (!run) return;

      set({ runInfo: run });

      if (run.status === 'completed') {
        const conclusion = run.conclusion === 'success' ? 'success' : 'failed';
        set({ buildStatus: conclusion });

        if (conclusion === 'success') {
          // Trigger download automatically
          set({ buildStatus: 'downloading' });
          try {
            const artifacts = await getRunArtifacts(owner, repoName, run.id);
            const apkArtifact = artifacts.find(a => a.name.includes('apk'));
            if (apkArtifact) {
              const uri = await downloadArtifactToDevice(apkArtifact.archive_download_url);
              set({ buildStatus: 'success_downloaded', apkUri: uri });
            } else {
              set({ buildStatus: 'failed', errorMsg: 'No APK artifact found in completed run.' });
            }
          } catch (err: any) {
            set({ buildStatus: 'failed', errorMsg: `Artifact download failed: ${err.message}` });
          }
        }
      }
    } catch (err: any) {
      console.error("Poll status error", err);
    }
  }
}));
