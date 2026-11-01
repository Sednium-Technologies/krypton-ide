// OPFS (Origin Private File System) storage helpers
// Used primarily inside Web Workers for native-speed random file access.

export interface OPFSFileEntry {
  path: string;
  name: string;
  kind: 'file' | 'directory';
  size?: number;
  lastModified?: number;
}

export async function getOpfsRoot(): Promise<FileSystemDirectoryHandle> {
  return await navigator.storage.getDirectory();
}

export async function getProjectDirectory(
  projectId: string,
  create = true
): Promise<FileSystemDirectoryHandle> {
  const root = await getOpfsRoot();
  const projectsDir = await root.getDirectoryHandle('projects', { create });
  return await projectsDir.getDirectoryHandle(projectId, { create });
}

export async function resolvePathHandle(
  projectDir: FileSystemDirectoryHandle,
  filePath: string,
  create = false
): Promise<FileSystemFileHandle> {
  const segments = filePath.split('/').filter(Boolean);
  let currentDir = projectDir;

  for (let i = 0; i < segments.length - 1; i++) {
    currentDir = await currentDir.getDirectoryHandle(segments[i], { create });
  }

  const fileName = segments[segments.length - 1] || 'unnamed';
  return await currentDir.getFileHandle(fileName, { create });
}

export async function readOpfsFile(
  projectDir: FileSystemDirectoryHandle,
  filePath: string
): Promise<string> {
  const fileHandle = await resolvePathHandle(projectDir, filePath, false);
  const file = await fileHandle.getFile();
  return await file.text();
}

export async function writeOpfsFile(
  projectDir: FileSystemDirectoryHandle,
  filePath: string,
  content: string
): Promise<number> {
  const fileHandle = await resolvePathHandle(projectDir, filePath, true);
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
  const file = await fileHandle.getFile();
  return file.lastModified;
}

export async function deleteOpfsFile(
  projectDir: FileSystemDirectoryHandle,
  filePath: string
): Promise<void> {
  const segments = filePath.split('/').filter(Boolean);
  let currentDir = projectDir;

  for (let i = 0; i < segments.length - 1; i++) {
    currentDir = await currentDir.getDirectoryHandle(segments[i], { create: false });
  }

  const fileName = segments[segments.length - 1];
  if (fileName) {
    await currentDir.removeEntry(fileName);
  }
}

export async function listOpfsFiles(
  dirHandle: FileSystemDirectoryHandle,
  basePath = ''
): Promise<OPFSFileEntry[]> {
  const entries: OPFSFileEntry[] = [];

  for await (const [name, handle] of (dirHandle as any).entries()) {
    const currentPath = basePath ? `${basePath}/${name}` : name;
    if (handle.kind === 'file') {
      const fileHandle = handle as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      entries.push({
        path: currentPath,
        name,
        kind: 'file',
        size: file.size,
        lastModified: file.lastModified,
      });
    } else if (handle.kind === 'directory') {
      entries.push({
        path: currentPath,
        name,
        kind: 'directory',
      });
      const subEntries = await listOpfsFiles(handle as FileSystemDirectoryHandle, currentPath);
      entries.push(...subEntries);
    }
  }

  return entries;
}
