import { useAuthStore } from '../store/useAuthStore';

const REPO_OWNER = 'Sednium-Technologies';
const REPO_NAME = 'krypton-ide';
const API_BASE = 'https://api.github.com';
const RELEASES_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`;

export const APP_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '4.0.0';

export interface ReleaseAsset {
  name: string;
  downloadUrl: string;
  size: number;
}

export interface ReleaseInfo {
  version: string;
  tagName: string;
  name: string;
  notes: string;
  publishedAt: string | null;
  htmlUrl: string;
  prerelease: boolean;
  assets: ReleaseAsset[];
}

export interface ReleaseCheckResult {
  currentVersion: string;
  latest: ReleaseInfo | null;
  updateAvailable: boolean;
  releases: ReleaseInfo[];
  checkedAt: number;
  source: 'releases' | 'tags';
}

interface GitHubRelease {
  tag_name?: string;
  name?: string;
  body?: string;
  published_at?: string | null;
  created_at?: string | null;
  html_url?: string;
  prerelease?: boolean;
  draft?: boolean;
  assets?: Array<{
    name?: string;
    browser_download_url?: string;
    size?: number;
  }>;
}

interface GitHubTag {
  name?: string;
}

function cleanVersion(value: string): string {
  return String(value || '').trim().replace(/^v/i, '').split('+')[0];
}

function parseVersion(value: string): { core: number[]; pre: string[] } {
  const clean = cleanVersion(value);
  const [corePart, prePart = ''] = clean.split('-', 2);
  const core = corePart.split('.').map((part) => {
    const match = part.match(/^\d+/);
    return match ? Number(match[0]) : 0;
  });
  while (core.length < 3) core.push(0);
  const pre = prePart
    ? prePart.split('.').map((part) => part.toLowerCase())
    : [];
  return { core, pre };
}

export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let i = 0; i < Math.max(left.core.length, right.core.length); i += 1) {
    const l = left.core[i] || 0;
    const r = right.core[i] || 0;
    if (l !== r) return l > r ? 1 : -1;
  }
  if (left.pre.length === 0 && right.pre.length > 0) return 1;
  if (right.pre.length === 0 && left.pre.length > 0) return -1;
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i += 1) {
    const l = left.pre[i];
    const r = right.pre[i];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    if (l === r) continue;
    const lNum = /^\d+$/.test(l);
    const rNum = /^\d+$/.test(r);
    if (lNum && rNum) return Number(l) > Number(r) ? 1 : -1;
    if (lNum) return -1;
    if (rNum) return 1;
    return l > r ? 1 : -1;
  }
  return 0;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}

function requestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
  };
  try {
    const token = useAuthStore.getState().githubToken;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // Auth store may not be initialized in non-UI contexts.
  }
  return headers;
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    headers: requestHeaders(),
    signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    if (response.status === 403 || response.status === 429) {
      throw new Error('GitHub API rate limit reached. Sign in to GitHub or retry later.');
    }
    throw new Error(`GitHub release check failed (HTTP ${response.status}).`);
  }
  return response.json() as Promise<T>;
}

function mapRelease(release: GitHubRelease): ReleaseInfo {
  const tagName = release.tag_name || '';
  const version = cleanVersion(tagName || release.name || '0.0.0');
  return {
    version,
    tagName,
    name: release.name || tagName || `v${version}`,
    notes: release.body || '',
    publishedAt: release.published_at || release.created_at || null,
    htmlUrl: release.html_url || `${RELEASES_URL}/tag/${tagName}`,
    prerelease: Boolean(release.prerelease),
    assets: (release.assets || [])
      .filter((asset) => asset.browser_download_url)
      .map((asset) => ({
        name: asset.name || 'download',
        downloadUrl: asset.browser_download_url as string,
        size: asset.size || 0,
      })),
  };
}

export async function checkForUpdates(): Promise<ReleaseCheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    let releases: ReleaseInfo[] = [];
    let source: 'releases' | 'tags' = 'releases';

    try {
      const data = await fetchJson<GitHubRelease[]>(
        `${API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/releases?per_page=10`,
        controller.signal
      );
      releases = (data || [])
        .filter((release) => !release.draft && release.tag_name)
        .map(mapRelease);
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') throw error;
      // A repository can publish tags without formal releases. Fall through to tags.
    }

    if (releases.length === 0) {
      source = 'tags';
      const tags = await fetchJson<GitHubTag[]>(
        `${API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/tags?per_page=20`,
        controller.signal
      );
      releases = (tags || [])
        .filter((tag) => tag.name)
        .map((tag) => {
          const tagName = tag.name as string;
          const version = cleanVersion(tagName);
          return {
            version,
            tagName,
            name: tagName,
            notes: '',
            publishedAt: null,
            htmlUrl: `${RELEASES_URL}/tag/${tagName}`,
            prerelease: false,
            assets: [],
          };
        });
    }

    const stable = releases.filter((release) => !release.prerelease);
    const ordered = [...releases].sort((a, b) => compareVersions(b.version, a.version));
    const latest = stable.sort((a, b) => compareVersions(b.version, a.version))[0] || ordered[0] || null;

    return {
      currentVersion: APP_VERSION,
      latest,
      updateAvailable: Boolean(latest && isNewerVersion(latest.version, APP_VERSION)),
      releases: ordered,
      checkedAt: Date.now(),
      source,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function formatReleaseDate(value: string | null): string {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
