const { contextBridge, ipcRenderer } = require('electron');

// Expose a clean API to the renderer (no direct Node access)
contextBridge.exposeInMainWorld('electronAPI', {
  // FFmpeg check
  checkFFmpeg: () => ipcRenderer.invoke('check-ffmpeg'),
  checkGpuEncoder: () => ipcRenderer.invoke('check-gpu-encoder'),

  // File dialogs
  saveDialog: (opts) => ipcRenderer.invoke('save-dialog', opts),

  // Render pipeline
  makeTempDir: () => ipcRenderer.invoke('make-temp-dir'),
  writeFrame: (dir, index, dataUrl) => ipcRenderer.invoke('write-frame', { dir, index, dataUrl }),
    writeFramesBatch: (dir, frames) => ipcRenderer.invoke('write-frames-batch', { dir, frames }),
  writeAudio: (dir, data) => ipcRenderer.invoke('write-audio', { dir, data }),
  renderMp4: (opts) => ipcRenderer.invoke('render-mp4', opts),
  cleanTempDir: (dir) => ipcRenderer.invoke('clean-temp-dir', dir),
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),

  // Decode audio via ffmpeg (bypasses Chrome native codec crash on Windows)
  decodeAudioPCM: (data, name) => ipcRenderer.invoke('decode-audio-pcm', { data, name }),

  // Progress listener
  onRenderProgress: (cb) => {
    ipcRenderer.on('render-progress', (_, data) => cb(data));
  },
  removeRenderProgressListener: () => {
    ipcRenderer.removeAllListeners('render-progress');
  },

  // Is this desktop?
  isDesktop: true
});
