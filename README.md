<div align="center">

<img src="src/assets/AdventistEditorIcon.png" width="100" alt="AdventistEditor" />

# AdventistEditor

**Professional desktop video editor for social-media-ready content.**

[![Version](https://img.shields.io/badge/version-0.1.2-blue?style=flat-square)](https://github.com/nionx01/AdventistEditor/releases)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgrey?style=flat-square&logo=windows)](https://github.com/nionx01/AdventistEditor/releases)
[![License](https://img.shields.io/badge/license-Proprietary-red?style=flat-square)](LICENSE)
[![Electron](https://img.shields.io/badge/built%20with-Electron-47848F?style=flat-square&logo=electron)](https://electronjs.org)

[Download](https://github.com/nionx01/AdventistEditor/releases) &nbsp;·&nbsp; [Report a Bug](https://github.com/nionx01/AdventistEditor/issues) &nbsp;·&nbsp; [Contact](mailto:jbenjamyn1@gmail.com)

</div>

<br>

## Overview

AdventistEditor is a proprietary desktop video editing application built for content creators who need to transform long recordings such as sermons, speeches, interviews, and podcasts into polished short-form content ready for TikTok, YouTube Shorts, Instagram Reels, and similar platforms.

The app runs entirely offline with no subscriptions or cloud dependencies. FFmpeg is bundled inside the installer so users never need to install anything separately.

<br>

## Features

**Multi-track Timeline** — Two video tracks with drag-and-drop clip placement, split at playhead, trim, and delete.

**AI Subtitle Generation** — Auto-transcribe any video using local Whisper AI. Fully offline, no API key needed.

**Subtitle Styling** — Control font, size, color, outline, background box, and display mode per style preset.

**Phone Preview Mode** — Live 9:16 phone bezel overlay so you can frame vertical content before exporting.

**Export Engine** — MP4 and GIF export with presets for TikTok, Reels, Shorts, and Landscape.

**Project System** — Save and reopen `.aeproj` project files with full media and clip persistence.

**Auto-Updater** — Silently checks GitHub Releases on startup and prompts when a new version is available.

<br>

## Download

Go to the [Releases](https://github.com/nionx01/AdventistEditor/releases) page and download the latest `AdventistEditorSetup-x.x.x.exe`.

> Windows may show a SmartScreen prompt on first launch because the app is not yet code-signed. Click **Run anyway** to proceed. The app is safe to install.

<br>

## System Requirements

| Requirement | Minimum |
|---|---|
| OS | Windows 10 or Windows 11 (64-bit) |
| RAM | 4 GB |
| Storage | 300 MB plus space for your video files |
| Python | Optional, only needed for AI subtitle generation |

<br>

## Building from Source

This project is proprietary. Building from source is permitted only for personal use in accordance with the [LICENSE](LICENSE).

**Prerequisites**

- [Node.js](https://nodejs.org) 18 or newer
- Git

**Setup**

```bash
git clone https://github.com/nionx01/AdventistEditor.git
cd AdventistEditor
npm install
npm run dev
```

**Build Windows Installer**

```bash
npm run make
```

Output will be placed in `dist/AdventistEditorSetup-x.x.x.exe`.

<br>

## Keyboard Shortcuts

| Key | Action |
|---|---|
| Space | Play and Pause |
| I | Mark In |
| O | Mark Out |
| Delete | Delete selected clip |
| Left and Right arrows | Seek 1 second |
| Up and Down arrows | Seek 5 seconds |
| Ctrl and Scroll | Timeline zoom |

<br>

## License

Copyright (c) 2026 NionX. All Rights Reserved.

This software is proprietary and closed-source. Copying, modifying, redistributing, or reverse engineering any part of this software is strictly prohibited. See [LICENSE](LICENSE) for full terms.

For inquiries contact [jbenjamyn1@gmail.com](mailto:jbenjamyn1@gmail.com).

<br>

<div align="center">
  <sub>Built by <a href="https://github.com/nionx01">NionX</a></sub>
</div>
