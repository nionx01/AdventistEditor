/**
 * AdventistEditor — Main Process
 *
 * The native OS menu bar is intentionally removed.
 * All app actions live in the Figma-style logo dropdown in the sidebar.
 */

const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs   = require('fs');

const ProjectService = require('../services/ProjectService');
const MediaService   = require('../services/MediaService');
const FFmpegService  = require('../services/FFmpegService');
const ExportService  = require('../services/ExportService');
const WhisperService = require('../services/WhisperService');

let splashWindow = null;
let mainWindow   = null;

const projectService = new ProjectService();
const mediaService   = new MediaService();
const ffmpegService  = new FFmpegService();
const exportService  = new ExportService(ffmpegService);
const whisperService = new WhisperService(ffmpegService);

// ---------------------------------------------------------------------------
// Auto-Updater (production only)
// ---------------------------------------------------------------------------
function initAutoUpdater() {
  if (app.isPackaged) {
    try {
      require('update-electron-app')({
        repo: 'your-github-username/AdventistEditor',
        updateInterval: '1 hour',
      });
    } catch (err) {
      console.error('Auto-updater init failed:', err.message);
    }
  }
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

  // Recent projects list
  ipcMain.handle('project:get-recent', async () => projectService.getRecentProjects());

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

  // Dialogs
  ipcMain.handle('dialog:save-file', async (_e, opts) => dialog.showSaveDialog(mainWindow, opts));
  ipcMain.handle('dialog:open-file', async (_e, opts) => dialog.showOpenDialog(mainWindow, opts));

  // App info
  ipcMain.handle('app:get-version', ()         => app.getVersion());
  ipcMain.handle('app:get-path',    (_e, name) => app.getPath(name));

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
