/**
 * AdventistEditor — Main Process
 *
 * The native OS menu bar is intentionally removed.
 * All app actions live in the Figma-style logo dropdown in the sidebar.
 */

// ---------------------------------------------------------------------------
// Squirrel Windows installer event handler
// Must run before anything else — handles install/uninstall/update shortcuts.
// ---------------------------------------------------------------------------
if (require('electron-squirrel-startup')) process.exit(0);

const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const { execFile, exec } = require('child_process');
const path = require('path');
const fs   = require('fs');

const ProjectService  = require('../services/ProjectService');
const MediaService    = require('../services/MediaService');
const FFmpegService   = require('../services/FFmpegService');
const ExportService   = require('../services/ExportService');
const WhisperService  = require('../services/WhisperService');
const SettingsService = require('../services/SettingsService');

let splashWindow = null;
let mainWindow   = null;

const settingsService = new SettingsService();
const projectService  = new ProjectService(settingsService);
const mediaService   = new MediaService();
const ffmpegService  = new FFmpegService();
const exportService  = new ExportService(ffmpegService);
const whisperService = new WhisperService(ffmpegService);

// ---------------------------------------------------------------------------
// Auto-Updater (production only — skipped in dev mode)
// Uses electron-updater which works with electron-builder GitHub releases
// ---------------------------------------------------------------------------
function initAutoUpdater() {
  if (!app.isPackaged) return; // never run in dev

  try {
    const { autoUpdater } = require('electron-updater');

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', () => {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: 'A new version of AdventistEditor is downloading in the background. You will be notified when it\'s ready to install.',
        buttons: ['OK'],
      });
    });

    autoUpdater.on('update-downloaded', () => {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: 'A new update has been downloaded. Restart AdventistEditor to apply it.',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
      }).then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
    });

    autoUpdater.checkForUpdatesAndNotify();
  } catch (err) {
    console.error('Auto-updater init failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// First-run setup flag helpers
// ---------------------------------------------------------------------------
function getSetupFlagPath() {
  return path.join(app.getPath('userData'), '.setup-complete');
}

function isFirstRun() {
  return !fs.existsSync(getSetupFlagPath());
}

function markSetupComplete() {
  try { fs.writeFileSync(getSetupFlagPath(), new Date().toISOString()); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Splash Window
// ---------------------------------------------------------------------------
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 360,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: '#0d0d0d',
    icon: path.join(__dirname, '..', 'assets', 'AdventistEditorIcon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
    },
  });
  splashWindow.loadFile(path.join(__dirname, '..', 'renderer', 'pages', 'splash.html'));
  splashWindow.center();
}

// ---------------------------------------------------------------------------
// Main Editor Window
// ---------------------------------------------------------------------------
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#0d0d0d',
    title: 'AdventistEditor',
    icon: path.join(__dirname, '..', 'assets', 'AdventistEditorIcon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
    },
  });

  // Remove the native menu bar — the renderer has its own dropdown
  Menu.setApplicationMenu(null);

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'pages', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    // Open maximized so the editor has full screen space
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ---------------------------------------------------------------------------
// Shared dialog helpers
// ---------------------------------------------------------------------------
async function handleOpenProject() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Project',
    filters: [{ name: 'AdventistEditor Project', extensions: ['aeproj'] }],
    properties: ['openFile'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    try {
      const project = await projectService.loadProject(result.filePaths[0]);
      mainWindow?.webContents.send('project:loaded', project);
    } catch (err) {
      dialog.showErrorBox('Open Project Error', err.message);
    }
  }
}

async function handleImportMedia() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Media',
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv'] },
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a'] },
      { name: 'All Files',   extensions: ['*'] },
    ],
    properties: ['openFile', 'multiSelections'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    try {
      const items = [];
      for (const fp of result.filePaths) items.push(await mediaService.getMediaInfo(fp));
      mainWindow?.webContents.send('media:imported', items);
    } catch (err) {
      dialog.showErrorBox('Import Error', err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------
function registerIpcHandlers() {

  // Project
  ipcMain.handle('project:create',       async (_e, name) => projectService.createProject(name));
  ipcMain.handle('project:open',         async ()         => handleOpenProject());
  ipcMain.handle('project:open-by-path', async (_e, fp)   => projectService.loadProject(fp));
  ipcMain.handle('project:save-to-path', async (_e, fp, data) => projectService.saveProject(fp, data));
  ipcMain.handle('project:save', async (_e, data) => {
    const safeName = (data.name || 'untitled').replace(/[\\/:*?"<>|]/g, '-');
    // Default into the project's own subfolder: Documents\ProjectsAdventistEditor\<name>\
    const projectFolder = path.join(projectService.defaultProjectsDir, safeName);
    const r = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Project',
      defaultPath: path.join(projectFolder, `${safeName}.aeproj`),
      filters: [{ name: 'AdventistEditor Project', extensions: ['aeproj'] }],
    });
    return (!r.canceled && r.filePath) ? projectService.saveProject(r.filePath, data) : null;
  });

  // App settings
  ipcMain.handle('settings:get',  async ()           => settingsService.getAllResolved());
  ipcMain.handle('settings:set',  async (_e, updates) => settingsService.set(updates));
  ipcMain.handle('settings:pick-folder', async (_e, title) => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: title || 'Select Folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    return r.canceled ? null : r.filePaths[0];
  });

  // Recent projects list
  ipcMain.handle('project:get-recent',         async ()        => projectService.getRecentProjects());
  ipcMain.handle('project:remove-from-recent', async (_e, fp)  => projectService.removeFromRecent(fp));
  ipcMain.handle('project:delete-from-disk',   async (_e, fp)  => projectService.deleteProjectFromDisk(fp));

  // Media
  ipcMain.handle('media:import',             async ()            => handleImportMedia());
  ipcMain.handle('media:get-info',           async (_e, fp)      => mediaService.getMediaInfo(fp));
  ipcMain.handle('media:generate-thumbnail', async (_e, fp, o, t)=> mediaService.generateThumbnail(fp, o, t));

  // Export
  ipcMain.handle('export:render', async (_e, job) =>
    exportService.render(job, p => mainWindow?.webContents.send('export:progress', p))
  );
  ipcMain.handle('export:gif', async (_e, opts) =>
    exportService.exportGif(opts, p => mainWindow?.webContents.send('export:progress', p))
  );

  // FFmpeg / Audio
  ipcMain.handle('ffmpeg:check',   async ()            => ffmpegService.checkAvailability());
  ipcMain.handle('audio:extract',  async (_e, i, o)    => ffmpegService.extractAudio(i, o));
  ipcMain.handle('audio:replace',  async (_e, v, a, o) => ffmpegService.replaceAudio(v, a, o));
  ipcMain.handle('audio:mute',     async (_e, i, o)    => ffmpegService.muteAudio(i, o));

  // Whisper AI subtitle generation
  ipcMain.handle('whisper:check', async () => whisperService.checkAvailability());
  ipcMain.handle('whisper:generate', async (_e, videoPath, model) => {
    return whisperService.generateSubtitles(videoPath, model, (progress) => {
      mainWindow?.webContents.send('whisper:progress', progress);
    });
  });

  // Auto-install Python + Whisper for users who don't have them
  ipcMain.handle('whisper:install', async () => {
    const send = (step, percent, message) =>
      mainWindow?.webContents.send('whisper:install-progress', { step, percent, message });

    // Build a rich PATH so packaged Electron finds winget, python, pip
    const extraPaths = [
      'C:\\Windows\\System32',
      'C:\\Windows',
      process.env.LOCALAPPDATA + '\\Microsoft\\WindowsApps',   // winget
      process.env.APPDATA    + '\\Python\\Python311\\Scripts',
      process.env.LOCALAPPDATA + '\\Programs\\Python\\Python311',
      process.env.LOCALAPPDATA + '\\Programs\\Python\\Python311\\Scripts',
      process.env.LOCALAPPDATA + '\\Programs\\Python\\Python312',
      process.env.LOCALAPPDATA + '\\Programs\\Python\\Python312\\Scripts',
      'C:\\Python311', 'C:\\Python311\\Scripts',
      'C:\\Python312', 'C:\\Python312\\Scripts',
    ].filter(Boolean).join(';');

    const env = { ...process.env, PATH: extraPaths + ';' + (process.env.PATH || '') };

    // Helper: run a shell command with proper env
    const run = (cmd) => new Promise((resolve, reject) => {
      exec(cmd, { timeout: 360000, shell: true, env }, (err, stdout, stderr) => {
        // Some tools (winget) write to stderr even on success
        if (err && !stdout) reject(new Error(stderr || err.message));
        else resolve(stdout || stderr);
      });
    });

    // Try python launchers in order
    async function findPython() {
      for (const cmd of ['py', 'python', 'python3']) {
        try { await run(`${cmd} --version`); return cmd; } catch { /* try next */ }
      }
      return null;
    }

    try {
      // Step 1 — check Python
      send('python', 5, 'Checking for Python...');
      let pythonCmd = await findPython();

      if (!pythonCmd) {
        send('python', 10, 'Python not found. Installing via winget...');
        try {
          await run('winget install -e --id Python.Python.3.11 --silent --accept-source-agreements --accept-package-agreements');
          send('python', 28, 'Python installed. Updating PATH...');
          // Give Windows a moment to register Python on PATH
          await new Promise(r => setTimeout(r, 3000));
          pythonCmd = await findPython();
          if (!pythonCmd) throw new Error('Python installed but not found on PATH. Please restart the app.');
        } catch (wingetErr) {
          throw new Error(
            'Could not install Python automatically.\n' +
            'Please install Python 3.11 from https://python.org, ' +
            'tick "Add Python to PATH" during install, then click Retry.'
          );
        }
      }
      send('python', 35, `Python found (${pythonCmd}) ✓`);

      // Step 2 — upgrade pip
      send('pip', 40, 'Upgrading pip...');
      try { await run(`${pythonCmd} -m pip install --upgrade pip --quiet`); } catch { /* non-fatal */ }
      send('pip', 50, 'pip ready ✓');

      // Step 3 — install openai-whisper + torch (CPU)
      send('whisper', 55, 'Installing Whisper AI (may take 3–5 minutes on first install)...');
      await run(`${pythonCmd} -m pip install openai-whisper --quiet`);
      send('whisper', 88, 'openai-whisper installed ✓');

      // Step 4 — verify whisper is runnable
      send('verify', 93, 'Verifying Whisper...');
      try {
        await run(`${pythonCmd} -c "import whisper; print('ok')"`);
      } catch {
        // whisper import can fail if torch isn't installed yet — install it
        send('verify', 95, 'Installing torch (CPU)...');
        await run(`${pythonCmd} -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu --quiet`);
      }
      send('done', 100, 'Whisper AI is ready!');

      return { success: true };
    } catch (err) {
      send('error', 0, `Error: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  // Dialogs
  ipcMain.handle('dialog:save-file', async (_e, opts) => dialog.showSaveDialog(mainWindow, opts));
  ipcMain.handle('dialog:open-file', async (_e, opts) => dialog.showOpenDialog(mainWindow, opts));

  // App info
  ipcMain.handle('app:get-version',   ()         => app.getVersion());
  ipcMain.handle('app:get-path',      (_e, name) => app.getPath(name));
  ipcMain.handle('app:is-packaged',   ()         => app.isPackaged);
  ipcMain.handle('app:is-first-run',  ()         => isFirstRun());
  ipcMain.handle('setup:mark-complete', ()        => { markSetupComplete(); return true; });

  // System versions check (for Settings page)
  ipcMain.handle('system:check-versions', async () => {
    const extraPaths = [
      'C:\\Windows\\System32', 'C:\\Windows',
      (process.env.LOCALAPPDATA || '') + '\\Microsoft\\WindowsApps',
      (process.env.APPDATA    || '') + '\\Python\\Python311\\Scripts',
      (process.env.LOCALAPPDATA || '') + '\\Programs\\Python\\Python311',
      (process.env.LOCALAPPDATA || '') + '\\Programs\\Python\\Python311\\Scripts',
      (process.env.LOCALAPPDATA || '') + '\\Programs\\Python\\Python312',
      (process.env.LOCALAPPDATA || '') + '\\Programs\\Python\\Python312\\Scripts',
      'C:\\Python311', 'C:\\Python311\\Scripts',
      'C:\\Python312', 'C:\\Python312\\Scripts',
    ].filter(Boolean).join(';');
    const env = { ...process.env, PATH: extraPaths + ';' + (process.env.PATH || '') };

    const runSafe = (cmd) => new Promise(resolve => {
      exec(cmd, { timeout: 8000, shell: true, env }, (err, stdout, stderr) => {
        resolve((stdout || stderr || '').trim());
      });
    });

    // FFmpeg version from bundled binary
    let ffmpegVer = 'Bundled (unknown)';
    try {
      const ffPath = ffmpegService.ffmpegPath;
      if (ffPath) {
        const out = await runSafe(`"${ffPath}" -version`);
        const m = out.match(/version ([^\s]+)/);
        if (m) ffmpegVer = m[1];
      }
    } catch {}

    // Python version
    let pythonVer = 'Not installed';
    for (const cmd of ['py', 'python', 'python3']) {
      const out = await runSafe(`${cmd} --version`);
      if (out && out.includes('Python')) { pythonVer = out.replace('Python ', '').split(/\s/)[0]; break; }
    }

    // Whisper version
    let whisperVer = 'Not installed';
    for (const cmd of ['py', 'python', 'python3']) {
      const out = await runSafe(`${cmd} -c "import whisper; print(whisper.__version__)"`);
      if (out && !out.includes('Error') && !out.includes('Traceback') && !out.includes('ModuleNotFoundError') && out.length < 30) {
        whisperVer = out;
        break;
      }
    }

    return { ffmpeg: ffmpegVer, python: pythonVer, whisper: whisperVer };
  });

  // App actions — triggered from the logo dropdown
  ipcMain.handle('app:quit',            () => app.quit());
  ipcMain.handle('app:reload',          () => mainWindow?.webContents.reload());
  ipcMain.handle('app:toggle-devtools', () => mainWindow?.webContents.toggleDevTools());
  ipcMain.handle('app:fullscreen',      () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()));
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  initAutoUpdater();
  registerIpcHandlers();
  createSplashWindow();
  setTimeout(() => createMainWindow(), 2000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
