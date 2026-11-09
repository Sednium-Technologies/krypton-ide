import { useAuthStore } from '../store/useAuthStore';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import JSZip from 'jszip';

const API = 'https://api.github.com';

function headers() {
  const token = useAuthStore.getState().githubToken;
  if (!token) throw new Error('Not authenticated with GitHub');
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

export interface WorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  path?: string;
}

export interface Artifact {
  id: number;
  name: string;
  archive_download_url: string;
  size_in_bytes: number;
}

export async function triggerBuild(owner: string, repo: string, buildType: 'debug' | 'release' = 'debug'): Promise<void> {
  // Primary endpoint: /actions/workflows/build-android.yml/dispatches
  // Legacy repositories may still only have build.yml; fall back to it.
  const workflowFiles = ['build-android.yml', 'build.yml'];
  let lastError = 'No build workflow found in the repository';

  for (const workflowFile of workflowFiles) {
    const res = await fetch(`${API}/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          build_type: buildType
        }
      }),
    });

    if (res.ok) return;

    const error = await res.json().catch(() => ({}));
    lastError = error.message || `Failed to trigger ${workflowFile}: HTTP ${res.status}`;
    if (res.status !== 404) {
      throw new Error(lastError);
    }
  }

  throw new Error(lastError);
}

export async function getLatestRun(owner: string, repo: string): Promise<WorkflowRun | null> {
  for (const workflowFile of ['build-android.yml', 'build.yml']) {
    const res = await fetch(
      `${API}/repos/${owner}/${repo}/actions/workflows/${workflowFile}/runs?per_page=1`,
      { headers: headers() }
    );
    if (!res.ok) continue;
    const data = await res.json();
    const run = ((data.workflow_runs || []) as WorkflowRun[])[0];
    if (run) return run;
  }
  return null;
}

export async function getRunArtifacts(owner: string, repo: string, runId: number): Promise<Artifact[]> {
  const res = await fetch(`${API}/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`, {
    headers: headers()
  });

  if (!res.ok) return [];
  const data = await res.json();
  return data.artifacts as Artifact[];
}

export async function downloadArtifactToDevice(artifactDownloadUrl: string): Promise<string> {
  const res = await fetch(artifactDownloadUrl, {
    headers: headers(),
  });

  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);

  const archive = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(archive);
  const apkEntry = Object.values(zip.files).find(
    (entry) => !entry.dir && entry.name.toLowerCase().endsWith('.apk')
  );

  if (!apkEntry) {
    throw new Error('Build artifact did not contain an APK file');
  }

  const fileName = apkEntry.name.split('/').pop() || 'krypton-build.apk';

  if (!Capacitor.isNativePlatform()) {
    const blob = await apkEntry.async('blob');
    return URL.createObjectURL(blob);
  }

  const apkBase64 = await apkEntry.async('base64');
  await Filesystem.writeFile({
    path: fileName,
    data: apkBase64,
    directory: Directory.Data,
    recursive: true,
  });

  const uriResult = await Filesystem.getUri({
    path: fileName,
    directory: Directory.Data,
  });

  return uriResult.uri;
}
