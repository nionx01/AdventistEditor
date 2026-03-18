# AdventistEditor

> **Edit Long Videos Into Social-Ready Content**

AdventistEditor is a professional desktop video editing application built with Electron. It is designed to help content creators, students, and social media editors transform long recordings (sermons, speeches, interviews, podcasts) into polished short-form content for TikTok, YouTube Shorts, Instagram Reels, and other platforms.

---

## Features

- **Project System** — Create, save and re-open `.aeproj` project files (JSON)
- **Media Import** — Import video and audio files with automatic metadata extraction
- **Video Player** — Built-in preview player with play/pause, seek, and volume control
- **Timeline Editing** — Mark In/Out, trim clips, split at playhead, reorder, delete
- **Subtitle Engine** — Add, edit, style and preview subtitle blocks in real time
- **Style Presets** — Font, color, outline, background box, display mode per preset
- **Export System** — Export MP4 (TikTok/Shorts/Reels/Landscape) or GIF with quality settings
- **Audio Tools** — Extract, mute, replace, and mix background music (via FFmpeg)
- **Quick / Advanced Mode** — Toggle between a simplified and full editor layout
- **Auto-Updater** — Checks GitHub Releases for updates on startup

---

## Project Structure

```
AdventistEditor/
├── forge.config.js              # Electron Forge packaging config
├── package.json
├── README.md
│
└── src/
    ├── main/
    │   └── main.js              # Main process: windows, IPC, menu, updater
    │
    ├── preload/
    │   └── preload.js           # Secure contextBridge IPC bridge
    │
    ├── renderer/
    │   ├── pages/
    │   │   ├── index.html       # Main editor window
    │   │   └── splash.html      # Splash/loading screen
    │   ├── styles/
    │   │   ├── theme.css        # CSS variables, base reset
    │   │   ├── layout.css       # Structural layout (sidebar, panels, views)
    │   │   └── components.css   # Buttons, forms, player, timeline, subtitles
    │   └── modules/
    │       └── app.js           # All renderer logic (navigation, player, subtitles, export)
    │
    ├── services/
    │   ├── FFmpegService.js     # All FFmpeg operations (trim, concat, export, GIF, subtitles)
    │   ├── MediaService.js      # Media file metadata + thumbnail generation
    │   ├── ProjectService.js    # Project create/save/load + recent projects
    │   └── ExportService.js     # Orchestrates multi-step render pipeline
    │
    ├── data/
    │   ├── models.js            # Data model schemas + factory functions
    │   └── demoProject.js       # Pre-built demo project for testing
    │
    └── assets/
        ├── icons/               # App icons (.ico for Windows, .icns for macOS)
        └── fonts/               # Optional bundled fonts
```

---

## Getting Started

### Prerequisites

- **Node.js** 18 or newer — [nodejs.org](https://nodejs.org)
- **FFmpeg** installed and available on PATH — [ffmpeg.org](https://ffmpeg.org)
- **Git** (optional, for cloning)

Check your versions:
```bash
node -v
npm -v
ffmpeg -version
```

### Install Dependencies

```bash
cd AdventistEditor
npm install
```

### Run in Development

```bash
npm run dev
```

This starts Electron Forge in development mode with hot-reloading support.

---

## NPM Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start app in development mode |
| `npm run package` | Package the app (no installer) |
| `npm run make` | Build installer (`.exe` on Windows via Squirrel) |
| `npm run publish` | Publish release to GitHub Releases |

---

## How FFmpeg Is Used

FFmpeg powers all media processing in AdventistEditor. It is accessed through **`FFmpegService.js`** which provides clean, modular methods:

| Method | Description |
|---|---|
| `probe(filePath)` | Extract video/audio metadata |
| `trim(...)` | Cut a clip between two timestamps |
| `split(...)` | Split a file into two parts at a timestamp |
| `concat(...)` | Join multiple clips into one file |
| `crop(...)` | Crop video to specified dimensions |
| `scale(...)` | Resize video |
| `pad(...)` | Add letterbox/pillarbox padding |
| `burnSubtitles(...)` | Render `.srt` subtitles onto video |
| `extractAudio(...)` | Pull audio track from video |
| `muteAudio(...)` | Strip audio from video |
| `replaceAudio(...)` | Swap audio track with a new file |
| `mixBackgroundMusic(...)` | Mix background music under existing audio |
| `exportMp4(...)` | Final render with quality/framing settings |
| `exportGif(...)` | Two-pass palette GIF export |
| `generateThumbnail(...)` | Extract a frame as a JPEG thumbnail |

**FFmpeg must be installed** on the system or bundled with the app. You can set a custom path in Settings or via the constructor:

```js
const ffmpegService = new FFmpegService({ ffmpegPath: '/path/to/ffmpeg' });
```

If FFmpeg is not available, `FFmpegService` falls back to **demo mode** — it simulates progress without executing real commands.

---

## Packaging for Windows

To build a Windows installer:

```bash
npm run make
```

This uses `@electron-forge/maker-squirrel` to create a `.exe` Squirrel installer in `out/make/`.

Before building:
1. Add your app icon: `src/assets/icons/icon.ico`
2. Update `forge.config.js` with your app name and company details
3. Ensure `package.json` has the correct `version` field

---

## GitHub Releases Publishing

AdventistEditor is configured to publish releases to GitHub using `@electron-forge/publisher-github`.

### Setup

1. Set your GitHub repository in `forge.config.js`:
   ```js
   repository: {
     owner: 'your-github-username',
     name: 'AdventistEditor',
   }
   ```

2. Create a GitHub Personal Access Token with `repo` scope and set it as an environment variable:
   ```bash
   # Windows
   set GITHUB_TOKEN=ghp_your_token_here

   # macOS/Linux
   export GITHUB_TOKEN=ghp_your_token_here
   ```

3. Publish a release:
   ```bash
   npm run publish
   ```

This creates a **draft GitHub Release** with the installer attached. Review it on GitHub and publish when ready.

---

## How Updates Work

AdventistEditor uses [`update-electron-app`](https://github.com/electron/update-electron-app) for automatic updates.

**Update flow:**
1. App starts → splash screen shows
2. After 2 seconds, main window opens
3. If `app.isPackaged` is `true` (production build), `update-electron-app` runs in the background
4. It polls the GitHub Releases API every hour
5. If a new release is found, it downloads and notifies the user
6. User restarts the app to apply the update

**In development**, `app.isPackaged` is `false`, so updates are skipped automatically.

To configure the update repo in `main.js`:
```js
require('update-electron-app')({
  repo: 'your-github-username/AdventistEditor',
  updateInterval: '1 hour',
});
```

---

## Security Model

AdventistEditor follows Electron security best practices:

| Setting | Value |
|---|---|
| `contextIsolation` | `true` |
| `nodeIntegration` | `false` |
| `sandbox` | `false` (required for preload) |
| `IPC` | Whitelisted channels only via `contextBridge` |
| `remote` module | Not used |
| `eval` | Not used |

The preload script (`preload.js`) exposes `window.electronAPI` with:
- `invoke(channel, ...args)` — call main process handlers (whitelisted)
- `on(channel, callback)` — listen for main process events (whitelisted)
- `once(channel, callback)` — one-time listener

Any attempt to invoke or listen on a non-whitelisted channel throws an error immediately.

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `I` | Mark In |
| `O` | Mark Out |
| `Delete` | Delete selected clip or subtitle |
| `Arrow Left` | Move playhead back 1 second |
| `Arrow Right` | Move playhead forward 1 second |
| `Arrow Up` | Move playhead back 5 seconds |
| `Arrow Down` | Move playhead forward 5 seconds |

---

## Roadmap — Next Recommended Features

After the MVP, consider building these features in order:

1. **Real drag-and-drop import** — drop files directly onto the media panel
2. **Timeline drag-to-reorder** — drag clips along the track to reorder them
3. **Waveform rendering** — draw audio waveforms on timeline clips
4. **Auto-transcription** — integrate OpenAI Whisper or similar to auto-generate subtitles
5. **Word-by-word subtitle mode** — animate one word at a time with timing data
6. **Multi-track timeline** — add a second video/audio track for overlays and music
7. **Thumbnail grid view** — show video frames along the seek bar
8. **Zoom in/out on timeline** — for precise frame-level editing
9. **Undo/Redo stack** — full command history
10. **Export queue** — render multiple jobs in sequence
11. **Bundled FFmpeg** — ship FFmpeg with the app so users don't need to install it
12. **Dark/light theme toggle**
13. **Subtitle import from .srt file**
14. **Burn subtitles preview** — show exactly how subtitles will look when burned

---

## License

MIT — See `LICENSE` file.

---

## Built With

- [Electron](https://electronjs.org)
- [Electron Forge](https://www.electronforge.io)
- [fluent-ffmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg)
- [update-electron-app](https://github.com/electron/update-electron-app)
