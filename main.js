const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

// Keep GPU acceleration enabled for faster canvas/render performance

// Increase renderer V8 heap to prevent OOM crash on large audio files
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');

let mainWindow;

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
    const gpuCodec = 'h264_nvenc';
    let encoderUsed = gpuCodec;
    const parallelRendering = true;

    // Build FFmpeg args with required GPU encoder (no CPU fallback)
    const args = [
      '-y',
      '-framerate', String(opts.fps),
      '-i', path.join(opts.framesDir, 'f%06d.jpg'),
      '-i', opts.audioPath,
      '-c:v', gpuCodec,
      '-cq', '19',
      '-preset', 'p5',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-pix_fmt', 'yuv420p',
      '-shortest',
      '-movflags', '+faststart',
      opts.outputPath
    ];

    const proc = spawn('ffmpeg', args);
    let stderr = '';
    let encoderDetected = false;

    proc.stderr.on('data', data => {
      stderr += data.toString();
      
      // Detect which encoder FFmpeg actually used
      if (!encoderDetected) {
        if (stderr.includes('h264_nvenc')) {
          encoderUsed = 'h264_nvenc (GPU)';
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

    proc.on('error', err => reject({ ok: false, msg: 'FFmpeg spawn error: ' + err.message }));
    proc.on('close', code => {
      if (code === 0) resolve({ ok: true, encoder: encoderUsed, parallelRendering });
      else reject({ ok: false, msg: 'FFmpeg failed (exit ' + code + ')\n' + stderr.slice(-500) });
    });
  });
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
      const hasGpu = output.includes('h264_nvenc');
      resolve({
        gpu: hasGpu,
        encoder: hasGpu ? 'h264_nvenc (GPU)' : 'Not available'
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
