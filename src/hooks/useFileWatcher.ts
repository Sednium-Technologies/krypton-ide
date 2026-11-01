import { useEffect } from 'react';
import * as Comlink from 'comlink';
import { fsWorker } from '../lib/workerBridge';
import { useIdeStore } from '../store/useIdeStore';
import { useProjectsStore } from '../store/useProjectsStore';

export function useFileWatcher() {
  const currentProjectId = useProjectsStore((state) => state.currentProjectId);
  const updateFileContent = useIdeStore((state) => state.updateFileContent);
  const files = useIdeStore((state) => state.files);

  useEffect(() => {
    if (!currentProjectId) return;

    // Start poll loop inside worker
    fsWorker.startWatcher(currentProjectId);

    const handleEvent = Comlink.proxy((event: any) => {
      if (event.type === 'file-changed' && event.path && event.content !== undefined) {
        // Find matching file in store by path
        const fileEntry = Object.values(files).find((f) => f.type === 'file' && f.name === event.path.split('/').pop());
        if (fileEntry && fileEntry.content !== event.content) {
          updateFileContent(fileEntry.id, event.content);
        }
      }
    });

    fsWorker.addListener(handleEvent);

    return () => {
      fsWorker.removeListener(handleEvent);
      fsWorker.stopWatcher();
    };
  }, [currentProjectId, files, updateFileContent]);
}
