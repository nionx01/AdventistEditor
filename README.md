# AdventistEditor

> **Edit Long Videos Into Social-Ready Content**

AdventistEditor is a professional desktop video editing application built with Electron. It helps content creators transform long recordings (sermons, speeches, interviews, podcasts) into polished short-form content for TikTok, YouTube Shorts, Instagram Reels, and other platforms.

**GitHub Repository:** [github.com/nionx01/AdventistEditor](https://github.com/nionx01/AdventistEditor)

---

## Features

- **Project System** — Create, save and re-open `.aeproj` project files
- **Media Import** — Import video and audio files with automatic metadata extraction
- **Video Player** — Built-in preview player with play/pause, seek, and volume control
- **Timeline Editing** — Mark In/Out, trim clips, split at playhead, reorder, delete
- **Subtitle Engine** — Add, edit, style and preview subtitle blocks in real time
- **AI Subtitles** — Generate subtitles automatically using Whisper AI (installed on first launch)
- **Style Presets** — Font, color, outline, background box, display mode per preset
- **Export System** — Export MP4 (TikTok/Shorts/Reels/Landscape) or GIF
- **Audio Tools** — Extract, mute, replace, and mix background music
- **Auto-Updater** — Checks GitHub Releases for updates automatically (packaged builds only)
- **Bundled FFmpeg** — FFmpeg ships with the app — users do not need to install it separately

---

## Project Structure

```
AdventistEditor/
├── forge.config.js              # Electron Forge packaging + GitHub publisher config
├── package.json
├── README.md
│
└── src/
    ├── main/
    │   └── main.js              # Main process: windows, IPC, updater, first-run setup
    │
    ├── preload/
    │   └── preload.js           # Secure contextBridge IPC bridge (channel whitelist)
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
    │       └── app.js           # All renderer logic
    │
    ├── services/
    │   ├── FFmpegService.js     # All FFmpeg operations (uses bundled ffmpeg-static)
    │   ├── WhisperService.js    # Whisper AI subtitle generation pipeline
    │   ├── MediaService.js      # Media file metadata + thumbnail generation
    │   ├── ProjectService.js    # Project create/save/load + recent projects
    │   └── ExportService.js     # Orchestrates multi-step render pipeline
    │
    └── assets/
        ├── AdventistEditorIcon.png    # In-app icon (transparent background)
        ├── AdventistEditorLogo.png    # Logo for packaging
        └── AdventistEditorLogo.ico   # Windows installer icon
```

---

## Getting Started (Development)

### Prerequisites

- **Node.js** 18 or newer — [nodejs.org](https://nodejs.org)
- **Git** (optional, for cloning)

FFmpeg does **not** need to be installed — it is bundled via `ffmpeg-static`.

### Install Dependencies

```bash
cd AdventistEditor
npm install
```

### Run in Development

```bash
npm run dev
```

---

## NPM Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start app in development mode |
| `npm run package` | Package the app without installer |
| `npm run make` | Build Windows installer (`.exe`) |
| `npm run publish` | Publish release to GitHub Releases |

---

## Bundled Dependencies

| Dependency | Bundled? | Notes |
|---|---|---|
| FFmpeg | ✅ Yes | Via `ffmpeg-static` — no install needed |
| FFprobe | ✅ Yes | Via `ffprobe-static` — no install needed |
| Whisper AI | ⚡ Auto-installed | Installed automatically on first launch via in-app setup |
| Python | ⚡ Auto-installed | Installed automatically if missing (requires `winget` on Windows) |

---

## Whisper AI — Auto Install on First Launch

When a user installs AdventistEditor and opens it for the first time, the app automatically detects whether Whisper AI (and Python) are installed. If not, it starts the installation automatically — no manual steps required.

**What happens on first launch:**

1. App opens and checks for Whisper AI
2. If Whisper is missing, the install panel opens automatically in the editor
3. A progress bar shows each step: Python check → pip upgrade → Whisper install
4. When complete, Whisper AI is ready and the setup flag is saved so it never runs again

Users can also trigger this manually by clicking the **AI Generate** button in the Subtitles tab.

---

## Packaging for Windows

To build a Windows installer:

```bash
npm run make
```

This uses `@electron-forge/maker-squirrel` to produce `AdventistEditorSetup.exe` in `out/make/`.

Before building, ensure:
- `src/assets/AdventistEditorLogo.ico` exists
- `package.json` has the correct `version` field (bump it for each release)
- `forge.config.js` has `owner: 'nionx01'` (already set)

---

## GitHub Releases Publishing

AdventistEditor is configured to publish to **[github.com/nionx01/AdventistEditor](https://github.com/nionx01/AdventistEditor)** via `@electron-forge/publisher-github`.

### Step 1 — Set your GitHub token

Create a GitHub Personal Access Token with `repo` scope at [github.com/settings/tokens](https://github.com/settings/tokens), then set it as an environment variable:

```bash
# Windows (Command Prompt)
set GITHUB_TOKEN=ghp_your_token_here

# Windows (PowerShell)
$env:GITHUB_TOKEN = "ghp_your_token_here"
```

### Step 2 — Bump the version

Edit `package.json` and increment the `version` field before each release:

```json
"version": "0.0.2"
```

### Step 3 — Publish

```bash
npm run publish
```

This creates a **draft GitHub Release** at `github.com/nionx01/AdventistEditor/releases` with the installer attached. Review it there and click **Publish release** when ready.

---

## How Auto-Updates Work

AdventistEditor uses [`update-electron-app`](https://github.com/electron/update-electron-app) which polls `github.com/nionx01/AdventistEditor/releases` for new versions.

**Important:** Auto-updates only work in **packaged builds** (`npm run make`). In development (`npm run dev`), `app.isPackaged` is `false` so updates are skipped automatically.

**Update flow:**

1. App starts and shows the splash screen
2. Main window opens
3. In background, updater polls GitHub Releases every hour
4. If a newer version is found, it downloads silently and prompts the user to restart
5. User restarts — new version is applied

To release an update: bump `version` in `package.json`, run `npm run publish`, then publish the GitHub draft release.

---

## Security Model

| Setting | Value |
|---|---|
| `contextIsolation` | `true` |
| `nodeIntegration` | `false` |
| `sandbox` | `false` (required for preload file access) |
| IPC | Whitelisted channels only via `contextBridge` |
| `remote` module | Not used |

All IPC calls go through `window.electronAPI` (defined in `preload.js`) which only allows channels explicitly listed in `INVOKE_CHANNELS` and `LISTEN_CHANNELS`.

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

## License

MIT — See `LICENSE` file.

---

## Built With

- [Electron](https://electronjs.org)
- [Electron Forge](https://www.electronforge.io)
- [fluent-ffmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg)
- [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static)
- [update-electron-app](https://github.com/electron/update-electron-app)
- [OpenAI Whisper](https://github.com/openai/whisper) (local, open-source)
