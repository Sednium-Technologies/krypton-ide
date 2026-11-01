import * as Comlink from 'comlink';

// Worker instances using Vite's native worker query syntax
const rawFSWorker = new Worker(new URL('../workers/fsWorker.ts', import.meta.url), { type: 'module' });
const rawSearchWorker = new Worker(new URL('../workers/searchWorker.ts', import.meta.url), { type: 'module' });
const rawLintWorker = new Worker(new URL('../workers/lintWorker.ts', import.meta.url), { type: 'module' });

export const fsWorker = Comlink.wrap<import('../workers/fsWorker').FSWorkerImpl>(rawFSWorker);
export const searchWorker = Comlink.wrap<import('../workers/searchWorker').SearchWorkerImpl>(rawSearchWorker);
export const lintWorker = Comlink.wrap<import('../workers/lintWorker').LintWorkerImpl>(rawLintWorker);
