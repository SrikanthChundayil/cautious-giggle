# Srikanth's Suite — Desktop Edition

Stitch · Visualise · Export — with native FFmpeg rendering.

## Requirements

- Node.js (already installed)
- FFmpeg in your system PATH

### Install FFmpeg on Windows
1. Download from https://ffmpeg.org/download.html → Windows builds → gyan.dev
2. Extract the zip, copy the `bin` folder contents somewhere (e.g. `C:\ffmpeg\bin`)
3. Add `C:\ffmpeg\bin` to your Windows PATH environment variable
4. Verify: open a new terminal and run `ffmpeg -version`

## Setup & Run

```bash
# 1. Install Electron (one time)
npm install

# 2. Launch the app
npm start
```

## Why desktop is faster

| Method         | Engine          | Threads | Speed (1hr video) |
|----------------|-----------------|---------|-------------------|
| Browser wasm   | FFmpeg.wasm     | 1       | 2–3 hours         |
| Desktop native | System FFmpeg   | All CPUs| 5–15 minutes      |

## How rendering works

1. Frames are rendered to an offscreen canvas at your chosen resolution
2. Each PNG frame is sent to the main process and written to a temp folder
3. Native FFmpeg reads the frames + WAV audio and encodes to MP4
4. Output file is saved directly to your chosen location — no browser download needed
5. Temp folder is cleaned up automatically

## Files

```
srikanth-suite-desktop/
  main.js        — Electron main process (FFmpeg, file I/O)
  preload.js     — Secure IPC bridge
  package.json   — Dependencies
  src/
    index.html   — The full suite (same as browser version)
```
