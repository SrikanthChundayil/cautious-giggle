const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

// Keep GPU acceleration enabled for faster canvas/render performance

// Increase renderer V8 heap to prevent OOM crash on large audio files
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');

let mainWindow;
const activeRenderJobs = new Map();

function terminateProcessTree(proc) {
  if (!proc || proc.killed) return;
  try {
    proc.kill('SIGTERM');
  } catch (_) {}
  if (process.platform === 'win32' && proc.pid) {
    try {
      spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F']);
    } catch (_) {}
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 700,
    title: "Srikanth's Suite",
    backgroundColor: '#0c0c0f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false
    }
  });
  mainWindow.loadFile('src/index.html');

  // Auto-reload on renderer crash instead of staying black
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Renderer process gone:', details.reason, details.exitCode);
    mainWindow.reload();
  });
  mainWindow.webContents.on('unresponsive', () => {
    console.warn('Renderer unresponsive — reloading...');
    mainWindow.reload();
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── CHECK FFMPEG ──────────────────────────────────────────
ipcMain.handle('check-ffmpeg', async () => {
  return new Promise(resolve => {
    const proc = spawn('ffmpeg', ['-version']);
    proc.on('error', () => resolve({ ok: false, msg: 'FFmpeg not found. Install from https://ffmpeg.org' }));
    proc.on('close', code => resolve({ ok: code === 0, msg: code === 0 ? 'FFmpeg ready' : 'FFmpeg error' }));
  });
});

// ── SAVE FILE DIALOG ──────────────────────────────────────
ipcMain.handle('save-dialog', async (_, opts) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: opts.title || 'Save File',
    defaultPath: opts.defaultPath || 'output',
    filters: opts.filters || [{ name: 'All Files', extensions: ['*'] }]
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('open-folder-dialog', async (_, opts) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: (opts && opts.title) || 'Select Output Folder',
    defaultPath: (opts && opts.defaultPath) || app.getPath('videos'),
    properties: ['openDirectory', 'createDirectory']
  });
  return result.canceled || !result.filePaths || result.filePaths.length === 0 ? null : result.filePaths[0];
});

ipcMain.handle('open-project-dialog', async (_, opts) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: (opts && opts.title) || 'Open Project',
    defaultPath: (opts && opts.defaultPath) || app.getPath('documents'),
    properties: ['openFile'],
    filters: opts && opts.filters ? opts.filters : [{ name: 'Srikanth Suite Project', extensions: ['ssproj', 'json'] }]
  });
  return result.canceled || !result.filePaths || result.filePaths.length === 0 ? null : result.filePaths[0];
});

ipcMain.handle('write-project-file', async (_, { filePath, content }) => {
  try {
    if (!filePath) return { ok: false, error: 'Missing file path.' };
    fs.writeFileSync(path.resolve(String(filePath)), String(content || ''), 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle('read-project-file', async (_, { filePath }) => {
  try {
    if (!filePath) return { ok: false, error: 'Missing file path.' };
    const full = path.resolve(String(filePath));
    if (!fs.existsSync(full)) return { ok: false, error: 'Project file not found.' };
    const content = fs.readFileSync(full, 'utf8');
    return { ok: true, content };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle('read-binary-file', async (_, { filePath }) => {
  try {
    if (!filePath) return { ok: false, error: 'Missing file path.' };
    const full = path.resolve(String(filePath));
    if (!fs.existsSync(full)) return { ok: false, error: 'Source file not found.' };
    const stat = fs.statSync(full);
    const buf = fs.readFileSync(full);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return {
      ok: true,
      data: ab,
      name: path.basename(full),
      size: stat.size,
      lastModified: stat.mtimeMs
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

// ── RENDER MP4 WITH NATIVE FFMPEG ────────────────────────
ipcMain.handle('render-mp4', async (event, opts) => {
  /*
    opts = {
      framesDir: string,    // dir containing f000000.png, f000001.png …
      audioPath: string,    // path to temp audio file
      outputPath: string,   // where to save the mp4
      fps: number,
      width: number,
      height: number,
      videoEncoder: string  // 'h264_nvenc' (GPU) or 'libx264' (CPU), defaults to 'libx264'
    }
  */
  return new Promise((resolve, reject) => {
    const renderJobId = opts && opts.renderJobId ? String(opts.renderJobId) : null;
    // Select GPU encoder based on platform
    const gpuCodec = process.platform === 'darwin' ? 'hevc_videotoolbox' : 'h264_nvenc';
    let encoderUsed = gpuCodec;
    const parallelRendering = true;

    // Build FFmpeg args with GPU encoder (platform-specific parameters)
    const args = [
      '-y',
      '-framerate', String(opts.fps),
      '-i', path.join(opts.framesDir, 'f%06d.jpg'),
      '-i', opts.audioPath,
      '-c:v', gpuCodec,
    ];
    
    // Add encoder-specific parameters
    if (process.platform === 'darwin') {
      // macOS VideoToolbox parameters
      args.push('-q:v', '75');  // Quality for VideoToolbox
      args.push('-preset', 'fast');  // fast, medium, slow
    } else {
      // NVIDIA NVENC parameters
      args.push('-cq', '19');
      args.push('-preset', 'p5');
    }
    
    // Common audio/container parameters
    args.push('-c:a', 'aac');
    args.push('-b:a', '192k');
    args.push('-pix_fmt', 'yuv420p');
    args.push('-shortest');
    args.push('-movflags', '+faststart');
    args.push(opts.outputPath);

    const proc = spawn('ffmpeg', args);
  if (renderJobId) activeRenderJobs.set(renderJobId, { proc, canceled: false });
    let stderr = '';
    let encoderDetected = false;

    proc.stderr.on('data', data => {
      stderr += data.toString();
      
      // Detect which encoder FFmpeg actually used
      if (!encoderDetected) {
        const isMac = process.platform === 'darwin';
        const encoderPatterns = isMac 
          ? ['hevc_videotoolbox', 'h264_videotoolbox']
          : ['h264_nvenc'];
        
        if (encoderPatterns.some(pattern => stderr.includes(pattern))) {
          const detectedCodec = encoderPatterns.find(pattern => stderr.includes(pattern)) || gpuCodec;
          encoderUsed = `${detectedCodec} (GPU)`;
          encoderDetected = true;
          event.sender.send('render-progress', {
            frame: 0,
            phase: 'encoding',
            encoder: encoderUsed,
            parallelRendering
          });
        }
      }
      
      // Parse progress from FFmpeg stderr: "frame=  120 fps= 45 …"
      const frameMatch = stderr.match(/frame=\s*(\d+)/g);
      if (frameMatch) {
        const lastFrame = parseInt(frameMatch[frameMatch.length - 1].replace('frame=', '').trim());
        event.sender.send('render-progress', {
          frame: lastFrame,
          phase: 'encoding',
          encoder: encoderUsed,
          parallelRendering
        });
      }
    });

    proc.on('error', err => {
      if (renderJobId) activeRenderJobs.delete(renderJobId);
      reject({ ok: false, msg: 'FFmpeg spawn error: ' + err.message });
    });
    proc.on('close', code => {
      const entry = renderJobId ? activeRenderJobs.get(renderJobId) : null;
      if (renderJobId) activeRenderJobs.delete(renderJobId);
      if (entry && entry.canceled) {
        reject({ ok: false, canceled: true, msg: 'Render canceled by user.' });
        return;
      }
      if (code === 0) resolve({ ok: true, encoder: encoderUsed, parallelRendering });
      else reject({ ok: false, msg: 'FFmpeg failed (exit ' + code + ')\n' + stderr.slice(-500) });
    });
  });
});

ipcMain.handle('cancel-render', async (_, { renderJobId } = {}) => {
  let canceled = 0;
  const ids = renderJobId ? [String(renderJobId)] : Array.from(activeRenderJobs.keys());
  for (const id of ids) {
    const entry = activeRenderJobs.get(id);
    if (!entry || !entry.proc) continue;
    entry.canceled = true;
    terminateProcessTree(entry.proc);
    canceled++;
  }
  return { ok: true, canceled };
});

// ── CHECK GPU ENCODER AVAILABILITY ──────────────────────────
ipcMain.handle('check-gpu-encoder', async () => {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', ['-encoders']);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => {
      stdout += data.toString();
    });
    proc.stderr.on('data', data => {
      stderr += data.toString();
    });

    proc.on('close', () => {
      const output = stdout + stderr;
      const isMac = process.platform === 'darwin';
      const hasGpu = isMac 
        ? output.includes('hevc_videotoolbox') || output.includes('h264_videotoolbox')
        : output.includes('h264_nvenc');
      const encoder = isMac 
        ? (output.includes('hevc_videotoolbox') ? 'hevc_videotoolbox (GPU)' : (output.includes('h264_videotoolbox') ? 'h264_videotoolbox (GPU)' : 'Not available'))
        : (hasGpu ? 'h264_nvenc (GPU)' : 'Not available');
      resolve({
        gpu: hasGpu,
        encoder: encoder
      });
    });

    proc.on('error', () => {
      resolve({ gpu: false, encoder: 'Not available' });
    });
  });
});

// ── WRITE FRAME ───────────────────────────────────────────
// Renderer sends PNG data URLs frame by frame; we write to temp dir
ipcMain.handle('write-frame', async (_, { dir, index, dataUrl }) => {
  const data = dataUrl.replace(/^data:image\/png;base64,/, '');
  const buf = Buffer.from(data, 'base64');
  const fname = path.join(dir, 'f' + String(index).padStart(6, '0') + '.png');
  fs.writeFileSync(fname, buf);
  return true;
});

// ── WRITE FRAMES BATCH (fast path — JPEG binary, no base64) ──────────
ipcMain.handle('write-frames-batch', async (_, { dir, frames }) => {
  await Promise.all(
    frames.map(({ index, data }) => {
      const fname = path.join(dir, 'f' + String(index).padStart(6, '0') + '.jpg');
      return fs.promises.writeFile(fname, Buffer.from(data));
    })
  );
  return true;
});

// ── WRITE AUDIO ───────────────────────────────────────────
ipcMain.handle('write-audio', async (_, { dir, data }) => {
  const audioPath = path.join(dir, 'audio.wav');
  const buf = Buffer.from(data);
  fs.writeFileSync(audioPath, buf);
  return audioPath;
});

// ── MAKE TEMP DIR ─────────────────────────────────────────
ipcMain.handle('make-temp-dir', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'srikanth-render-'));
  return dir;
});

// ── CLEAN TEMP DIR ────────────────────────────────────────
ipcMain.handle('clean-temp-dir', async (_, dir) => {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch(e) {}
  return true;
});

// ── OPEN FILE IN SYSTEM ───────────────────────────────────
ipcMain.handle('show-in-folder', async (_, filePath) => {
  shell.showItemInFolder(filePath);
  return true;
});

// ── DECODE AUDIO TO RAW PCM VIA FFMPEG ───────────────────
// Bypasses Chrome's native codec (which crashes on Windows with certain audio files)
ipcMain.handle('decode-audio-pcm', async (_, { data, name }) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'srikanth-dec-'));
  const ext = (name || 'audio.tmp').replace(/.*\./, '').slice(0, 8) || 'tmp';
  const inputPath = path.join(tmpDir, 'input.' + ext);
  const outputPath = path.join(tmpDir, 'output.raw');
  try {
    fs.writeFileSync(inputPath, Buffer.from(data));
    await new Promise((resolve, reject) => {
      const args = ['-y', '-i', inputPath, '-f', 'f32le', '-ar', '44100', '-ac', '2', outputPath];
      const proc = spawn('ffmpeg', args);
      let stderr = '';
      proc.stderr.on('data', d => stderr += d.toString());
      proc.on('error', err => reject(new Error('ffmpeg not found: ' + err.message)));
      proc.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg exit ' + code + ': ' + stderr.slice(-400))));
    });
    const raw = fs.readFileSync(outputPath);
    const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    return { ok: true, sampleRate: 44100, numberOfChannels: 2, buffer: ab };
  } catch(e) {
    return { ok: false, error: e.message };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(_) {}
  }
});

// Decode audio directly from a file path (used after on-disk rename)
ipcMain.handle('decode-audio-pcm-path', async (_, { filePath }) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'srikanth-dec-'));
  const outputPath = path.join(tmpDir, 'output.raw');
  try {
    if (!filePath) return { ok: false, error: 'Missing file path.' };
    const srcPath = path.resolve(String(filePath));
    if (!fs.existsSync(srcPath)) return { ok: false, error: 'Source file not found.' };

    await new Promise((resolve, reject) => {
      const args = ['-y', '-i', srcPath, '-f', 'f32le', '-ar', '44100', '-ac', '2', outputPath];
      const proc = spawn('ffmpeg', args);
      let stderr = '';
      proc.stderr.on('data', d => stderr += d.toString());
      proc.on('error', err => reject(new Error('ffmpeg not found: ' + err.message)));
      proc.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg exit ' + code + ': ' + stderr.slice(-400))));
    });

    const raw = fs.readFileSync(outputPath);
    const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    return { ok: true, sampleRate: 44100, numberOfChannels: 2, buffer: ab };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
});

// ── RENAME AUDIO FILE ON DISK ──────────────────────────────
ipcMain.handle('rename-audio-file', async (_, { oldPath, newBaseName }) => {
  try {
    if (!oldPath || !newBaseName) return { ok: false, error: 'Missing path or name.' };
    if (!fs.existsSync(oldPath)) return { ok: false, error: 'Source file not found.' };

    const srcPath = path.resolve(oldPath);
    const dir = path.dirname(srcPath);
    const srcExt = path.extname(srcPath);
    const srcBase = path.basename(srcPath);

    const cleanedRaw = String(newBaseName)
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleanedRaw) return { ok: false, error: 'Invalid file name.' };

    const baseOnly = path.basename(cleanedRaw);
    const proposedExt = path.extname(baseOnly);
    const nameNoExt = proposedExt ? baseOnly.slice(0, -proposedExt.length).trim() : baseOnly;
    if (!nameNoExt) return { ok: false, error: 'Invalid file name.' };

    const finalExt = proposedExt || srcExt;
    const makeName = (n) => `${n}${finalExt}`;

    let candidateName = makeName(nameNoExt);
    let candidatePath = path.join(dir, candidateName);
    if (candidatePath.toLowerCase() === srcPath.toLowerCase()) {
      return { ok: true, path: srcPath, name: srcBase };
    }

    let idx = 1;
    while (fs.existsSync(candidatePath)) {
      candidateName = makeName(`${nameNoExt} (${idx})`);
      candidatePath = path.join(dir, candidateName);
      idx++;
    }

    await fs.promises.rename(srcPath, candidatePath);
    return { ok: true, path: candidatePath, name: candidateName };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});
