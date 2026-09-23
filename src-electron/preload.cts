import { contextBridge, ipcRenderer } from 'electron';
import { installNimiElectronRuntimeBridge } from '@nimiplatform/kit/shell/electron/preload-cjs';

installNimiElectronRuntimeBridge({
  contextBridge,
  ipcRenderer,
});

// Forwards the Kit Host's session invalidation so the renderer can stop work
// that belongs to the ended Nimi session. It carries no session material.
const SESSION_INVALIDATED_CHANNEL = 'parentos:session-invalidated';
contextBridge.exposeInMainWorld('parentOSHost', {
  onSessionInvalidated(listener: () => void): () => void {
    const handler = () => listener();
    ipcRenderer.on(SESSION_INVALIDATED_CHANNEL, handler);
    return () => { ipcRenderer.removeListener(SESSION_INVALIDATED_CHANNEL, handler); };
  },
});
