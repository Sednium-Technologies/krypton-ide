/**
 * Open VSX Registry Service for Kryptonide
 * Provides search, details fetching, and streaming downloads for VS Code extensions.
 */

export interface MarketplaceExtensionFiles {
  download?: string;
  icon?: string;
  readme?: string;
  changelog?: string;
  manifest?: string;
  license?: string;
  [key: string]: string | undefined;
}

export interface MarketplaceExtension {
  namespace: string;
  name: string;
  id: string;
  displayName: string;
  description: string;
  version: string;
  publisher: string;
  downloadCount: number;
  averageRating: number;
  reviewCount?: number;
  iconUrl?: string;
  categories: string[];
  files: MarketplaceExtensionFiles;
  timestamp?: string;
  license?: string;
  verified?: boolean;
}

export interface ExtensionDetailMetadata {
  namespace: string;
  name: string;
  id: string;
  displayName: string;
  description: string;
  version: string;
  publisher: string;
  downloadCount: number;
  averageRating: number;
  reviewCount: number;
  license: string;
  categories: string[];
  iconUrl?: string;
  downloadUrl: string;
  readmeUrl?: string;
  changelogUrl?: string;
  manifestUrl?: string;
  allVersions: Record<string, string>;
  readme?: string;
  changelog?: string;
  manifest?: any;
  files?: MarketplaceExtensionFiles;
  repository?: string;
  homepage?: string;
  verified?: boolean;
}

export interface OpenVsxSearchResponse {
  extensions: MarketplaceExtension[];
  totalSize: number;
  offset: number;
}

const OPEN_VSX_BASE_URL = 'https://open-vsx.org/api';

/**
 * Normalizes UI category identifiers to Open VSX registry category names.
 */
export function normalizeCategory(category?: string): string {
  if (!category || category === 'all') return '';
  const lower = category.toLowerCase();
  switch (lower) {
    case 'theme':
    case 'themes':
      return 'Themes';
    case 'language':
    case 'languages':
      return 'Languages';
    case 'formatter':
    case 'formatters':
      return 'Formatters';
    case 'snippet':
    case 'snippets':
      return 'Snippets';
    case 'productivity':
    case 'tool':
    case 'tools':
      return 'Other';
    default:
      return category;
  }
}

/**
 * Normalizes UI sorting options to Open VSX registry sortBy values.
 */
export function normalizeSortBy(sortBy?: string): string {
  if (!sortBy) return 'relevance';
  const lower = sortBy.toLowerCase();
  switch (lower) {
    case 'downloads':
    case 'most downloads':
    case 'downloadcount':
      return 'downloadCount';
    case 'rating':
    case 'highest rated':
    case 'top rated':
      return 'rating';
    case 'updated':
    case 'recently updated':
    case 'timestamp':
      return 'timestamp';
    case 'relevance':
    default:
      return 'relevance';
  }
}

/**
 * Format download count into human-readable compact notation (e.g., 1.4M, 25k).
 */
export function formatDownloadCount(count?: number | string): string {
  if (count === undefined || count === null) return '0';
  if (typeof count === 'string') {
    const trimmed = count.trim();
    if (/[kKmMbB]$/.test(trimmed)) return trimmed;
    const parsed = parseFloat(trimmed);
    if (isNaN(parsed) || parsed <= 0) return trimmed;
    count = parsed;
  }
  if (count <= 0) return '0';
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}k`;
  }
  return `${count}`;
}

/**
 * Format rating with 1 decimal place.
 */
export function formatRating(rating?: number | string): string {
  if (rating === undefined || rating === null) return 'N/A';
  const num = typeof rating === 'number' ? rating : parseFloat(String(rating));
  if (isNaN(num) || num <= 0) return 'N/A';
  return num.toFixed(1);
}

/**
 * Searches the Open VSX registry with query, category, sort options, and pagination.
 */
export async function searchOpenVsx(
  query: string = '',
  category?: string,
  sortBy: string = 'relevance',
  offset: number = 0,
  size: number = 20
): Promise<OpenVsxSearchResponse> {
  const normCategory = normalizeCategory(category);
  const normSort = normalizeSortBy(sortBy);

  const params = new URLSearchParams();
  if (query.trim()) params.set('query', query.trim());
  if (normCategory) params.set('category', normCategory);
  if (normSort) params.set('sortBy', normSort);
  params.set('offset', String(offset));
  params.set('size', String(size));

  const url = `${OPEN_VSX_BASE_URL}/-/search?${params.toString()}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open VSX search failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const rawList = Array.isArray(data.extensions) ? data.extensions : [];

  const extensions: MarketplaceExtension[] = rawList.map((item: any) => {
    const namespace = item.namespace || item.publishedBy || 'community';
    const name = item.name || '';
    const id = `${namespace}.${name}`;
    const iconUrl = item.files?.icon || undefined;

    return {
      namespace,
      name,
      id,
      displayName: item.displayName || name,
      description: item.description || '',
      version: item.version || '1.0.0',
      publisher: namespace,
      downloadCount: typeof item.downloadCount === 'number' ? item.downloadCount : 0,
      averageRating: typeof item.averageRating === 'number' ? item.averageRating : 0,
      reviewCount: typeof item.reviewCount === 'number' ? item.reviewCount : 0,
      iconUrl,
      categories: Array.isArray(item.categories) ? item.categories : [],
      files: item.files || {},
      timestamp: item.timestamp,
      license: item.license || '',
      verified: !!item.verified,
    };
  });

  return {
    extensions,
    totalSize: typeof data.totalSize === 'number' ? data.totalSize : extensions.length,
    offset: typeof data.offset === 'number' ? data.offset : offset,
  };
}

/**
 * Fetches extension metadata, all versions map, README, Changelog, and manifest from Open VSX.
 */
export async function fetchExtensionDetails(
  namespace: string,
  name: string,
  version?: string
): Promise<ExtensionDetailMetadata> {
  const isSpecificVersion = !!version && version !== 'latest';
  const url = isSpecificVersion
    ? `${OPEN_VSX_BASE_URL}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`
    : `${OPEN_VSX_BASE_URL}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch extension details: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const files: MarketplaceExtensionFiles = data.files || {};
  const downloadUrl = files.download || '';
  const readmeUrl = files.readme || undefined;
  const changelogUrl = files.changelog || undefined;
  const manifestUrl = files.manifest || undefined;

  // Concurrently fetch readme, changelog, and manifest if present
  let readme: string | undefined;
  let changelog: string | undefined;
  let manifest: any = undefined;

  const asyncTasks: Promise<void>[] = [];

  if (readmeUrl) {
    asyncTasks.push(
      fetch(readmeUrl)
        .then((r) => (r.ok ? r.text() : ''))
        .then((t) => {
          if (t) readme = t;
        })
        .catch(() => {})
    );
  }

  if (changelogUrl) {
    asyncTasks.push(
      fetch(changelogUrl)
        .then((r) => (r.ok ? r.text() : ''))
        .then((t) => {
          if (t) changelog = t;
        })
        .catch(() => {})
    );
  }

  if (manifestUrl) {
    asyncTasks.push(
      fetch(manifestUrl)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (j) manifest = j;
        })
        .catch(() => {})
    );
  }

  if (asyncTasks.length > 0) {
    await Promise.allSettled(asyncTasks);
  }

  return {
    namespace: data.namespace || namespace,
    name: data.name || name,
    id: `${data.namespace || namespace}.${data.name || name}`,
    displayName: data.displayName || data.name || name,
    description: data.description || '',
    version: data.version || version || '1.0.0',
    publisher: data.namespace || namespace,
    downloadCount: typeof data.downloadCount === 'number' ? data.downloadCount : 0,
    averageRating: typeof data.averageRating === 'number' ? data.averageRating : 0,
    reviewCount: typeof data.reviewCount === 'number' ? data.reviewCount : 0,
    license: data.license || '',
    categories: Array.isArray(data.categories) ? data.categories : [],
    iconUrl: files.icon || undefined,
    downloadUrl,
    readmeUrl,
    changelogUrl,
    manifestUrl,
    allVersions: typeof data.allVersions === 'object' && data.allVersions ? data.allVersions : {},
    readme,
    changelog,
    manifest,
    files,
    repository: data.repository || undefined,
    homepage: data.homepage || undefined,
    verified: !!data.verified,
  };
}

/**
 * Streams download of a .vsix file from downloadUrl, reporting progress percentage.
 */
export async function downloadVsixBlob(
  downloadUrl: string,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const res = await fetch(downloadUrl);
  if (!res.ok) {
    throw new Error(`Failed to download extension package: HTTP ${res.status} ${res.statusText}`);
  }

  const contentLength = Number(res.headers.get('content-length')) || 0;
  if (!res.body || contentLength <= 0) {
    onProgress?.(50);
    const blob = await res.blob();
    onProgress?.(100);
    return blob;
  }

  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      receivedBytes += value.length;
      if (contentLength > 0) {
        const pct = Math.min(99, Math.round((receivedBytes / contentLength) * 100));
        onProgress?.(pct);
      }
    }
  }

  onProgress?.(100);
  return new Blob(chunks, { type: 'application/octet-stream' });
}

