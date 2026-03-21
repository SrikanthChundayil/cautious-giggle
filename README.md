# Srikanth's Suite - Desktop Edition

## Purpose
Srikanth's Suite is a local desktop tool for creators who need to stitch audio, design synchronized visualizers, and export final music videos quickly. The app exists to avoid browser limitations and provide faster, reliable native rendering with FFmpeg.

## What This App Is Used For
- Stitch multiple audio tracks into one timeline.
- Tune per-track volume, fade in/out, trim, and gaps.
- Send stitched audio directly into the Visualiser.
- Add image background, particle layers, visualizer effects, title cues, and lyrics.
- Export MP4 from desktop using native FFmpeg.

## Current App Modules
- Stitcher tab
- Visualiser tab

## Key Features (Latest)
### Stitcher
- Drag reorder tracks.
- Per-track controls: volume, fade in, fade out, trim start, trim end, gap after.
- Global gap control.
- Track preview with seek.
- Export stitched WAV.
- Send to Visualiser flow.

### Visualiser
- Load background image and audio.
- Real-time preview with play/pause and seek.
- Particle layer + visualizer effect layer controls.
- Separate particle intensity control.
- Title cues with timestamp-based hold end.
- Lyrics support:
  - Tap Sync mode
  - LRC input mode
- Multiple output aspect/resolution presets.

### Render / Export
- Native FFmpeg pipeline from Electron main process.
- JPEG frame batch write path for speed.
- Progress overlay during rendering.

Important: MP4 export is currently configured for NVIDIA NVENC (`h264_nvenc`) and has no CPU fallback in the current code path.

## Requirements
- Node.js
- FFmpeg available in system PATH
- NVIDIA GPU + NVENC-capable FFmpeg for MP4 export in current build

### FFmpeg Setup on Windows
1. Download FFmpeg from https://ffmpeg.org/download.html (Windows builds).
2. Extract and place `bin` in a stable location (example: `C:\ffmpeg\bin`).
3. Add that folder to Windows PATH.
4. Verify in a new terminal:

```bash
ffmpeg -version
```

## Setup and Run
```bash
npm install
npm start
```

## Typical Workflow
1. Open Stitcher and import tracks.
2. Adjust fades/volume/trims/gaps.
3. Stitch and use Send to Visualiser.
4. In Visualiser, set styles, titles, lyrics, and preview.
5. Render MP4.

## Project Structure
```text
srikanth-suite-desktop/
  main.js                   - Electron main process (FFmpeg, file I/O, GPU encode path)
  preload.js                - IPC bridge
  package.json              - Project metadata/scripts
  src/
    index.html              - Main UI and renderer logic (Stitcher + Visualiser)
    audio-decoder.worker.js - Audio decode worker
```

## Notes
- Desktop native rendering is substantially faster than browser WASM workflows.
- If `h264_nvenc` is unavailable, MP4 export will fail in the current implementation.
