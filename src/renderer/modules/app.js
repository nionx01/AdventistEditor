/**
 * AdventistEditor — Main Renderer Module
 *
 * Entry point for the renderer process.
 * Handles navigation, player, project management, timeline, subtitles, and export.
 */

'use strict';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const AppState = {
  currentView: 'welcome',
  activeEditorTab: 'timeline',
  project: null,
  projectFilePath: null,
  mediaItems: [],
  activeMediaIndex: -1,
  clips: [],
  selectedClipIndex: -1,
  subtitles: [],
  selectedSubtitleIndex: -1,
  markIn: null,
  markOut: null,
  isPlaying: false,
  stylePresets: [],
  activeStylePreset: 0,
  exportPresets: [],
  selectedExportPreset: 0,
  // Context menu state
  ctxProject: null,
  // Timeline zoom: pixels per second
  timelineZoom: 80,
  // Thumbnail cache: filePath -> local file:// path
  thumbnailCache: {},
};

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initLogoDropdown();
  initEditorTabs();
  initPlayer();
  initProjectButtons();
  initPreviewResize();
  initTimeline();
  initTimelineDropZone();
  initMediaDropZone();
  initSubtitles();
  initExport();
  initSettings();
  initKeyboardShortcuts();
  initMainProcessListeners();
  initProjectContextMenu();
  loadDefaultPresets();
  checkFFmpeg();
  loadAppVersion();
  loadAppSettings();
  loadRecentProjects();
});


// ---------------------------------------------------------------------------
// Logo Dropdown Menu (Figma-style)
// ---------------------------------------------------------------------------
function initLogoDropdown() {
  const btn      = document.getElementById('logo-menu-btn');
  const dropdown = document.getElementById('logo-dropdown');
  const overlay  = document.getElementById('logo-dropdown-overlay');

  if (!btn || !dropdown || !overlay) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !dropdown.classList.contains('hidden');
    isOpen ? closeLogoDropdown() : openLogoDropdown();
  });

  overlay.addEventListener('click', () => closeLogoDropdown());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLogoDropdown();
  });

  dropdown.querySelectorAll('.logo-dropdown-item[data-action]').forEach(item => {
    item.addEventListener('click', async () => {
      const action = item.dataset.action;
      closeLogoDropdown();
      switch (action) {
        case 'new-project':    createNewProject(); break;
        case 'open-project':   openProject(); break;
        case 'save-project':   saveProject(); break;
        case 'import-media':   importMedia(); break;
        case 'close-project':  closeProject(); break;
        case 'settings':       switchView('settings'); break;
        case 'toggle-devtools': await window.electronAPI.invoke('app:toggle-devtools'); break;
        case 'fullscreen':     await window.electronAPI.invoke('app:fullscreen'); break;
        case 'quit':           await window.electronAPI.invoke('app:quit'); break;
      }
    });
  });
}

function openLogoDropdown() {
  document.getElementById('logo-dropdown').classList.remove('hidden');
  document.getElementById('logo-dropdown-overlay').classList.remove('hidden');
  document.getElementById('logo-menu-btn').style.background = 'var(--bg-active)';
}

function closeLogoDropdown() {
  document.getElementById('logo-dropdown').classList.add('hidden');
  document.getElementById('logo-dropdown-overlay').classList.add('hidden');
  document.getElementById('logo-menu-btn').style.background = '';
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
function initNavigation() {
  document.querySelectorAll('.sidebar-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Close Project button
  document.getElementById('nav-close-project')?.addEventListener('click', () => {
    if (AppState.project) {
      const name = AppState.project.name || 'this project';
      if (!confirm(`Close "${name}"? It will be saved automatically.`)) return;
    }
    closeProject();
  });
}

function switchView(viewName) {
  // Sidebar active state
  document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector(`.sidebar-btn[data-view="${viewName}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  // View panels
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add('active');

  // Header title
  const titles = { welcome: 'Home', editor: 'Editor', settings: 'Settings' };
  document.getElementById('view-title').textContent = titles[viewName] || viewName;

  AppState.currentView = viewName;

  // When navigating to Settings, refresh system versions and saved settings
  if (viewName === 'settings') {
    setTimeout(loadSystemVersions, 150);
    loadAppSettings();
  }
}

// ---------------------------------------------------------------------------
// Project open/close — shows/hides editor nav button + header actions
// ---------------------------------------------------------------------------
function setProjectOpen(isOpen) {
  const navHome         = document.getElementById('nav-home');
  const navEditor       = document.getElementById('nav-editor');
  const navCloseProject = document.getElementById('nav-close-project');
  const btnImport       = document.getElementById('btn-import');
  const btnSave         = document.getElementById('btn-save');
  const badge           = document.getElementById('project-name-badge');

  // When a project is open: hide Home, show Editor + Close Project + header actions
  navHome?.classList.toggle('hidden', isOpen);
  navEditor?.classList.toggle('hidden', !isOpen);
  navCloseProject?.classList.toggle('hidden', !isOpen);
  btnImport?.classList.toggle('hidden', !isOpen);
  btnSave?.classList.toggle('hidden', !isOpen);
  if (!isOpen) badge?.classList.add('hidden');

  // Show/hide Close Project item in logo dropdown
  document.getElementById('logo-dropdown-close-project')?.classList.toggle('hidden', !isOpen);
}

// ---------------------------------------------------------------------------
// Close Project
// ---------------------------------------------------------------------------
function closeProject() {
  // Auto-save before closing so nothing is lost
  if (AppState.project) saveProject().catch(() => {});

  AppState.project         = null;
  AppState.projectFilePath = null;
  AppState.mediaItems      = [];
  AppState.clips           = [];
  AppState.subtitles       = [];
  AppState.selectedClipIndex    = -1;
  AppState.selectedSubtitleIndex = -1;
  AppState.activeMediaIndex = -1;
  AppState.markIn  = null;
  AppState.markOut = null;
  AppState.thumbnailCache = {};
  AppState.timelineZoom = 80;

  const video = document.getElementById('video-player');
  if (video) { video.src = ''; video.load(); }

  setProjectOpen(false);
  renderMediaList();
  renderTimeline();
  renderSubtitleList();
  switchView('welcome');
  loadRecentProjects();
  setStatus('Project closed');
}

// ---------------------------------------------------------------------------
// Editor Tab Bar (Timeline | Subtitles | Export)
// ---------------------------------------------------------------------------
function initEditorTabs() {
  document.querySelectorAll('.editor-tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => switchEditorTab(tab.dataset.tab));
  });
}

function switchEditorTab(tabName) {
  AppState.activeEditorTab = tabName;

  // Tab buttons
  document.querySelectorAll('.editor-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });

  // Tab content panels
  document.querySelectorAll('.editor-tab-content').forEach(panel => {
    const panelTab = panel.id.replace('tab-', '');
    panel.classList.toggle('hidden', panelTab !== tabName);
  });
}

// ---------------------------------------------------------------------------
// Project Context Menu
// ---------------------------------------------------------------------------
function initProjectContextMenu() {
  const menu = document.getElementById('project-ctx-menu');
  if (!menu) return;

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target)) hideProjectCtxMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideProjectCtxMenu();
  });

  // Handle actions
  menu.querySelectorAll('.project-ctx-item[data-ctx-action]').forEach(item => {
    item.addEventListener('click', async () => {
      const action = item.dataset.ctxAction;
      const proj   = AppState.ctxProject;
      hideProjectCtxMenu();
      if (!proj) return;

      switch (action) {
        case 'open':
          openProjectByPath(proj.filePath);
          break;
        case 'export':
          // Load project, switch to editor, then open export tab
          await openProjectByPath(proj.filePath);
          setTimeout(() => {
            switchView('editor');
            switchEditorTab('export');
          }, 100);
          break;
        case 'archive':
          setStatus(`"${proj.name}" archived (feature coming soon)`);
          break;
        case 'delete':
          showDeleteProjectModal(proj);
          break;
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Delete Project — 2-step confirmation modal + full disk deletion
// ---------------------------------------------------------------------------
function showDeleteProjectModal(proj) {
  const modal   = document.getElementById('modal-delete-project');
  const msgEl   = document.getElementById('modal-delete-project-msg');
  const btnConfirm = document.getElementById('modal-delete-project-confirm');
  const btnCancel  = document.getElementById('modal-delete-project-cancel');
  const btnClose   = document.getElementById('modal-delete-project-close');
  if (!modal) return;

  msgEl.textContent = `"${proj.name}" and all its files will be permanently deleted from your computer. This cannot be undone.`;
  modal.classList.remove('hidden');

  function close() {
    modal.classList.add('hidden');
    btnConfirm.removeEventListener('click', onConfirm);
    btnCancel.removeEventListener('click', close);
    btnClose.removeEventListener('click', close);
    modal.removeEventListener('click', onBackdrop);
  }

  async function onConfirm() {
    close();
    try {
      await window.electronAPI.invoke('project:delete-from-disk', proj.filePath);
      loadRecentProjects();
      setStatus(`"${proj.name}" deleted permanently.`);
    } catch (err) {
      setStatus('Delete failed: ' + (err.message || 'unknown error'));
    }
  }

  function onBackdrop(e) { if (e.target === modal) close(); }

  btnConfirm.addEventListener('click', onConfirm);
  btnCancel.addEventListener('click', close);
  btnClose.addEventListener('click', close);
  modal.addEventListener('click', onBackdrop);
}

function showProjectCtxMenu(projectData, x, y) {
  const menu = document.getElementById('project-ctx-menu');
  AppState.ctxProject = projectData;
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
  menu.classList.remove('hidden');

  // Keep menu inside viewport
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right  > window.innerWidth)  menu.style.left = (x - rect.width)  + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top  = (y - rect.height) + 'px';
  });
}

function hideProjectCtxMenu() {
  const menu = document.getElementById('project-ctx-menu');
  menu.classList.add('hidden');
  AppState.ctxProject = null;
}

// ---------------------------------------------------------------------------
// Recent Projects
// ---------------------------------------------------------------------------
async function loadRecentProjects() {
  try {
    const recent = await window.electronAPI.invoke('project:get-recent');
    renderRecentProjects(recent || []);
  } catch {
    renderRecentProjects([]);
  }
}

function renderRecentProjects(projects) {
  const container = document.getElementById('recent-projects-list');
  if (!container) return;

  if (!projects || projects.length === 0) {
    container.innerHTML = '<p class="home-empty-state">No recent projects yet — create or open a project to get started.</p>';
    return;
  }

  container.innerHTML = projects.map((proj, i) => {
    const date = proj.lastOpened ? new Date(proj.lastOpened).toLocaleDateString() : '';
    return `
      <div class="recent-project-card" data-index="${i}" title="${proj.filePath || ''}">
        <div class="recent-project-thumb">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="2" y="2" width="20" height="20" rx="2"/>
            <line x1="8" y1="2" x2="8" y2="22"/>
            <line x1="2" y1="15" x2="22" y2="15"/>
          </svg>
        </div>
        <div class="recent-project-info">
          <div class="recent-project-name">${escapeHtml(proj.name || 'Untitled')}</div>
          <div class="recent-project-meta">${date}${proj.filePath ? ' · ' + shortenPath(proj.filePath) : ''}</div>
        </div>
        <button class="recent-project-menu-btn" data-index="${i}" title="Project options" draggable="false">
          <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
            <circle cx="8" cy="3" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="8" cy="13" r="1.2"/>
          </svg>
        </button>
      </div>
    `;
  }).join('');

  // Click card = open project (load full data from .aeproj file on disk)
  container.querySelectorAll('.recent-project-card').forEach((card, i) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.recent-project-menu-btn')) return;
      openProjectByPath(projects[i].filePath);
    });
  });

  // Click 3-dot = show context menu
  container.querySelectorAll('.recent-project-menu-btn').forEach((btn, i) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const rect = btn.getBoundingClientRect();
      showProjectCtxMenu(projects[i], rect.right + 4, rect.top);
    });
  });
}

function shortenPath(fp) {
  if (!fp) return '';
  const parts = fp.replace(/\\/g, '/').split('/');
  return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : fp;
}

async function removeFromRecentProjects(filePath) {
  try {
    await window.electronAPI.invoke('project:remove-from-recent', filePath);
  } catch (err) {
    console.warn('Could not remove from recents:', err.message);
  }
}

// Load a project object directly into app state (from recent list)
function loadProjectData(proj) {
  if (!proj) return;
  AppState.project       = proj;
  AppState.projectFilePath = proj.filePath || null;
  AppState.mediaItems    = proj.mediaItems || [];
  AppState.clips         = proj.clips      || [];
  AppState.subtitles     = proj.subtitles  || [];
  if (proj.stylePresets) AppState.stylePresets = proj.stylePresets;

  setProjectOpen(true);
  updateProjectBadge(proj.name || 'Project');
  renderMediaList();
  renderTimeline();
  renderSubtitleList();
  renderStylePresets();
  switchView('editor');
  setStatus(`Opened: ${proj.name || 'Project'}`);
}

// ---------------------------------------------------------------------------
// Project Management
// ---------------------------------------------------------------------------
function initProjectButtons() {
  document.getElementById('btn-new-project')?.addEventListener('click', createNewProject);
  document.getElementById('btn-open-project')?.addEventListener('click', openProject);
  document.getElementById('btn-save')?.addEventListener('click', saveProject);
  document.getElementById('btn-import')?.addEventListener('click', importMedia);
  document.getElementById('btn-add-media')?.addEventListener('click', importMedia);

  // Delegate import button inside media panel
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-import-media')) importMedia();
  });
}

function createNewProject() {
  showNewProjectModal();
}

function showNewProjectModal() {
  const backdrop = document.getElementById('modal-new-project');
  const input    = document.getElementById('new-project-name');
  const btnConfirm = document.getElementById('modal-new-project-confirm');
  const btnCancel  = document.getElementById('modal-new-project-cancel');
  const btnClose   = document.getElementById('modal-new-project-close');

  // Reset and show
  input.value = '';
  backdrop.classList.remove('hidden');
  setTimeout(() => input.focus(), 50);

  function close() {
    backdrop.classList.add('hidden');
    btnConfirm.removeEventListener('click', onConfirm);
    btnCancel.removeEventListener('click',  close);
    btnClose.removeEventListener('click',   close);
    backdrop.removeEventListener('click',   onBackdropClick);
    input.removeEventListener('keydown',    onKeydown);
  }

  async function onConfirm() {
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    close();
    try {
      const project = await window.electronAPI.invoke('project:create', name);
      AppState.project         = project;
      AppState.projectFilePath = project.filePath || null;
      AppState.mediaItems      = [];
      AppState.clips           = [];
      AppState.subtitles       = [];
      setProjectOpen(true);
      updateProjectBadge(name);
      switchView('editor');
      setStatus(`Project "${name}" created`);
      loadRecentProjects();
    } catch (err) {
      setStatus('Error creating project: ' + err.message);
    }
  }

  function onKeydown(e) {
    if (e.key === 'Enter')  onConfirm();
    if (e.key === 'Escape') close();
  }

  function onBackdropClick(e) {
    if (e.target === backdrop) close();
  }

  btnConfirm.addEventListener('click', onConfirm);
  btnCancel.addEventListener('click',  close);
  btnClose.addEventListener('click',   close);
  backdrop.addEventListener('click',   onBackdropClick);
  input.addEventListener('keydown',    onKeydown);
}

async function openProject() {
  try {
    await window.electronAPI.invoke('project:open');
    // Result arrives via 'project:loaded' IPC event
  } catch (err) {
    setStatus('Error opening project');
  }
}

// Load a project directly from its .aeproj file path (reads full data from disk)
async function openProjectByPath(filePath) {
  if (!filePath) return;
  try {
    const fullProject = await window.electronAPI.invoke('project:open-by-path', filePath);
    loadProjectData(fullProject);
  } catch (err) {
    setStatus('Could not open project: ' + (err.message || 'file not found'));
  }
}

async function saveProject() {
  if (!AppState.project) { setStatus('No project to save'); return; }

  const projectData = {
    ...AppState.project,
    mediaItems:   AppState.mediaItems,
    clips:        AppState.clips,
    subtitles:    AppState.subtitles,
    stylePresets: AppState.stylePresets,
  };

  try {
    if (AppState.projectFilePath) {
      await window.electronAPI.invoke('project:save-to-path', AppState.projectFilePath, projectData);
      setStatus('Project saved');
    } else {
      const result = await window.electronAPI.invoke('project:save', projectData);
      if (result) { AppState.projectFilePath = result; setStatus('Project saved'); }
    }
  } catch (err) {
    setStatus('Error saving project: ' + err.message);
  }
}

// Auto-save silently (only when project has a file path — not a new unsaved project)
async function autoSaveProject() {
  if (!AppState.project || !AppState.projectFilePath) return;
  const projectData = {
    ...AppState.project,
    mediaItems:   AppState.mediaItems,
    clips:        AppState.clips,
    subtitles:    AppState.subtitles,
    stylePresets: AppState.stylePresets,
  };
  try {
    await window.electronAPI.invoke('project:save-to-path', AppState.projectFilePath, projectData);
    // Silent save — no status message to avoid interrupting the user
  } catch (err) {
    console.warn('Auto-save failed:', err.message);
  }
}

function updateProjectBadge(name) {
  const badge = document.getElementById('project-name-badge');
  badge.textContent = name;
  badge.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Media Import
// ---------------------------------------------------------------------------
async function importMedia() {
  try {
    await window.electronAPI.invoke('media:import');
  } catch (err) {
    setStatus('Import failed: ' + err.message);
  }
}

// Wire up file-drop onto the media panel so users can drag files from Explorer
function initMediaDropZone() {
  const panel = document.getElementById('media-list');
  if (!panel) return;

  panel.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    panel.classList.add('drop-active');
  });

  panel.addEventListener('dragleave', (e) => {
    if (!panel.contains(e.relatedTarget)) panel.classList.remove('drop-active');
  });

  panel.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    panel.classList.remove('drop-active');

    const videoExts = ['mp4','mov','avi','mkv','webm','wmv','mp3','wav','aac','ogg','flac','m4a'];
    const files = Array.from(e.dataTransfer.files)
      .filter(f => videoExts.includes(f.name.split('.').pop().toLowerCase()));

    if (files.length === 0) { setStatus('No supported video/audio files dropped.'); return; }

    setStatus(`Importing ${files.length} file(s)…`);
    const items = [];
    for (const file of files) {
      try {
        const info = await window.electronAPI.invoke('media:get-info', file.path);
        items.push(info);
      } catch { /* skip unreadable files */ }
    }
    if (items.length > 0) {
      AppState.mediaItems.push(...items);
      renderMediaList();
      if (AppState.activeMediaIndex < 0) selectMedia(0);
      setStatus(`${items.length} file(s) imported`);
      // Auto-save so media persists when the project is reopened
      autoSaveProject();
    }
  });
}

function renderMediaList() {
  const container = document.getElementById('media-list');
  if (AppState.mediaItems.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No media imported.</p>
        <button class="btn btn-sm btn-secondary btn-import-media">Import Files</button>
        <p class="drop-hint">or drag &amp; drop files here</p>
      </div>`;
    return;
  }

  container.innerHTML = AppState.mediaItems.map((item, i) => {
    const thumb = AppState.thumbnailCache[item.filePath];
    const thumbHtml = thumb
      ? `<img src="file://${thumb.replace(/\\/g,'/')}" alt="" draggable="false">`
      : `<div class="media-thumb-placeholder"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><polygon points="4 3 13 8 4 13 4 3"/></svg></div>`;
    return `
      <div class="media-item ${i === AppState.activeMediaIndex ? 'active' : ''}"
           data-index="${i}" draggable="true" title="Drag to timeline to add">
        <div class="media-thumb">${thumbHtml}</div>
        <div class="media-item-info">
          <div class="media-name">${escapeHtml(item.fileName || 'Unknown')}</div>
          <div class="media-meta">${item.duration ? formatTime(item.duration) : '--:--'} &middot; ${item.resolution || ''}</div>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.media-item').forEach(el => {
    el.addEventListener('click', () => selectMedia(parseInt(el.dataset.index)));
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', el.dataset.index);
      e.dataTransfer.effectAllowed = 'copy';
    });
  });

  // Generate missing thumbnails asynchronously
  generateMissingThumbnails();
}

async function generateMissingThumbnails() {
  for (let i = 0; i < AppState.mediaItems.length; i++) {
    const item = AppState.mediaItems[i];
    if (!item.filePath || item.type === 'audio') continue;
    if (AppState.thumbnailCache[item.filePath]) continue;

    try {
      const thumbPath = await window.electronAPI.invoke('media:generate-thumbnail', item.filePath, null, 1);
      if (thumbPath) {
        AppState.thumbnailCache[item.filePath] = thumbPath;
        // Update just this item's thumbnail in the DOM without full re-render
        const el = document.querySelector(`.media-item[data-index="${i}"] .media-thumb`);
        if (el) {
          el.innerHTML = `<img src="file://${thumbPath.replace(/\\/g,'/')}" alt="" draggable="false">`;
        }
        // Also update any timeline clips that use this media
        renderTimeline();
      }
    } catch { /* skip */ }
  }
}

function selectMedia(index) {
  // Just highlight the item in the media panel — do NOT load into player.
  // The preview player only shows clips that are on the timeline.
  AppState.activeMediaIndex = index;
  const item = AppState.mediaItems[index];
  if (!item) return;
  renderMediaList();
  setStatus(`Selected: ${item.fileName} — drag to timeline to add`);
}

// ---------------------------------------------------------------------------
// Video Player
// ---------------------------------------------------------------------------
function initPlayer() {
  const video        = document.getElementById('video-player');
  const seekbar      = document.getElementById('seekbar');
  const volumeSlider = document.getElementById('volume-slider');

  document.getElementById('btn-play').addEventListener('click', togglePlay);
  document.getElementById('btn-mark-in').addEventListener('click', markIn);
  document.getElementById('btn-mark-out').addEventListener('click', markOut);
  document.getElementById('btn-split').addEventListener('click', splitAtPlayhead);

  // Phone preview toggle
  document.getElementById('btn-phone-preview')?.addEventListener('click', togglePhonePreview);

  video.addEventListener('timeupdate', () => {
    if (video.duration) {
      seekbar.value = (video.currentTime / video.duration) * 100;
      updateTimeDisplay();
      updateSubtitleOverlay(video.currentTime);
      updateTimelinePlayhead();
    }
  });

  video.addEventListener('loadedmetadata', () => {
    updateTimeDisplay();
    document.getElementById('preview-empty').classList.add('hidden');
  });

  video.addEventListener('play',  () => {
    AppState.isPlaying = true;
    document.getElementById('icon-play').classList.add('hidden');
    document.getElementById('icon-pause').classList.remove('hidden');
  });

  video.addEventListener('pause', () => {
    AppState.isPlaying = false;
    document.getElementById('icon-play').classList.remove('hidden');
    document.getElementById('icon-pause').classList.add('hidden');
  });

  seekbar.addEventListener('input', () => {
    if (video.duration) video.currentTime = (seekbar.value / 100) * video.duration;
  });

  volumeSlider.addEventListener('input', () => { video.volume = volumeSlider.value; });
}

function togglePlay() {
  const video = document.getElementById('video-player');
  if (!video.src) return;
  video.paused ? video.play() : video.pause();
}

function loadVideoInPlayer(filePath) {
  if (!filePath) return;
  const video = document.getElementById('video-player');
  // Ensure proper file:// URL for Electron
  const src = filePath.startsWith('file://') ? filePath : 'file://' + filePath.replace(/\\/g, '/');
  video.src = src;
  video.load();
}

function togglePhonePreview() {
  const wrapper = document.getElementById('preview-wrapper');
  const btn     = document.getElementById('btn-phone-preview');
  if (!wrapper) return;
  const active = wrapper.classList.toggle('phone-mode');
  btn?.classList.toggle('active', active);

  if (active) {
    // Size the bezel shell to match the portrait video dimensions
    requestAnimationFrame(() => {
      const video = document.getElementById('video-player');
      const shell = document.querySelector('.phone-bezel-shell');
      if (!video || !shell) return;
      // Video in phone-mode is height:80% of wrapper, aspect 9:16
      const wrapperH = wrapper.clientHeight;
      const videoH   = Math.round(wrapperH * 0.80);
      shell.style.height = videoH + 'px';
    });
  }
}

function updateTimeDisplay() {
  const video = document.getElementById('video-player');
  document.getElementById('time-display').textContent =
    `${formatTime(video.currentTime)} / ${formatTime(video.duration || 0)}`;
}

function markIn() {
  const video = document.getElementById('video-player');
  if (!video.src) return;
  AppState.markIn = video.currentTime;
  setStatus(`Mark In: ${formatTime(AppState.markIn)}`);
}

function markOut() {
  const video = document.getElementById('video-player');
  if (!video.src) return;
  AppState.markOut = video.currentTime;
  setStatus(`Mark Out: ${formatTime(AppState.markOut)}`);
  if (AppState.markIn !== null && AppState.markOut > AppState.markIn) addClipFromMarks();
}

// ---------------------------------------------------------------------------
// Timeline & Clips
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Preview ↔ Timeline resizable split
// ---------------------------------------------------------------------------
function initPreviewResize() {
  const handle    = document.getElementById('preview-resize-handle');
  const container = document.getElementById('preview-container');
  if (!handle || !container) return;

  let dragging   = false;
  let startY     = 0;
  let startH     = 0;

  handle.addEventListener('mousedown', (e) => {
    dragging = true;
    startY   = e.clientY;
    startH   = container.getBoundingClientRect().height;
    handle.classList.add('dragging');
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const editorH  = container.parentElement?.getBoundingClientRect().height || 600;
    const delta    = e.clientY - startY;
    const newH     = Math.max(80, Math.min(startH + delta, editorH * 0.85));
    container.style.height = newH + 'px';
    container.style.flex   = 'none';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

function updateZoomLabel() {
  const label    = document.getElementById('timeline-zoom-label');
  if (!label) return;
  // Calculate how many seconds fit in ~600px visible width at current zoom
  const pxPerSec = AppState.timelineZoom;
  const visibleW = document.getElementById('timeline-clips-scroll')?.getBoundingClientRect().width || 600;
  const secVisible = visibleW / pxPerSec;
  if (secVisible >= 3600) {
    label.textContent = Math.round(secVisible / 3600) + 'h';
  } else if (secVisible >= 60) {
    label.textContent = Math.round(secVisible / 60) + 'm';
  } else {
    label.textContent = Math.round(secVisible) + 's';
  }
}

function initTimeline() {
  document.getElementById('btn-timeline-zoom-in')?.addEventListener('click', () => {
    AppState.timelineZoom = Math.min(AppState.timelineZoom * 1.5, 600);
    updateZoomLabel();
    renderTimeline();
  });
  document.getElementById('btn-timeline-zoom-out')?.addEventListener('click', () => {
    AppState.timelineZoom = Math.max(AppState.timelineZoom / 1.5, 5);
    updateZoomLabel();
    renderTimeline();
  });

  // Scroll-wheel zoom on timeline area
  document.getElementById('tab-timeline')?.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    if (e.deltaY < 0) {
      AppState.timelineZoom = Math.min(AppState.timelineZoom * 1.25, 600);
    } else {
      AppState.timelineZoom = Math.max(AppState.timelineZoom / 1.25, 5);
    }
    updateZoomLabel();
    renderTimeline();
  }, { passive: false });
}

function addClipFromMarks() {
  const clip = {
    id: generateId(),
    sourceIndex: AppState.activeMediaIndex,
    startTime: AppState.markIn,
    endTime: AppState.markOut,
    label: `Clip ${AppState.clips.length + 1}`,
  };
  AppState.clips.push(clip);
  AppState.markIn = null;
  AppState.markOut = null;
  renderTimeline();
  setStatus(`Clip added: ${formatTime(clip.startTime)} – ${formatTime(clip.endTime)}`);
  autoSaveProject();
}

function splitAtPlayhead() {
  const video = document.getElementById('video-player');
  if (!video.src || AppState.selectedClipIndex < 0) return;
  const clip = AppState.clips[AppState.selectedClipIndex];
  if (!clip) return;
  const t = video.currentTime;
  if (t <= clip.startTime || t >= clip.endTime) { setStatus('Playhead must be within the selected clip'); return; }
  const newClip = { id: generateId(), sourceIndex: clip.sourceIndex, startTime: t, endTime: clip.endTime, label: `${clip.label} (B)` };
  clip.endTime = t;
  clip.label   = `${clip.label} (A)`;
  AppState.clips.splice(AppState.selectedClipIndex + 1, 0, newClip);
  renderTimeline();
  setStatus(`Split at ${formatTime(t)}`);
}

function initTimelineDropZone() {
  // Use the stable scroll container as the drop target (timeline-track is rebuilt on render)
  const dropZone = document.getElementById('tab-timeline');
  if (!dropZone) return;

  dropZone.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('text/plain')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    dropZone.classList.add('drop-active');
  });

  dropZone.addEventListener('dragleave', (e) => {
    if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drop-active');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drop-active');
    const idx = parseInt(e.dataTransfer.getData('text/plain'));
    if (isNaN(idx)) return;
    const item = AppState.mediaItems[idx];
    if (!item) return;

    // Detect if dropped onto Track 2 row
    const t2Row = document.getElementById('timeline-track-row-2');
    const trackIndex = (t2Row && t2Row.contains(e.target)) ? 1 : 0;

    const clip = {
      id: generateId(),
      sourceIndex: idx,
      label: item.fileName || `Clip ${AppState.clips.length + 1}`,
      startTime: 0,
      endTime: item.duration || 0,
      trackIndex,
    };
    AppState.clips.push(clip);
    AppState.selectedClipIndex = AppState.clips.length - 1;
    renderTimeline();
    const trackName = trackIndex === 1 ? 'Track 2' : 'Track 1';
    setStatus(`"${clip.label}" added to ${trackName}`);
    autoSaveProject();

    // Load this clip's source video into the player if the player is empty
    const video = document.getElementById('video-player');
    if (item.filePath && (!video.src || video.src === '' || video.src === window.location.href)) {
      loadVideoInPlayer(item.filePath);
      document.getElementById('preview-empty')?.classList.add('hidden');
    }
  });
}

function buildClipHtml(clip, i, left, w) {
  const media = AppState.mediaItems[clip.sourceIndex];
  const thumb = media ? AppState.thumbnailCache[media.filePath] : null;
  // Filmstrip: tile thumbnail as background-image so it repeats across clip width
  const bgStyle = thumb
    ? `background-image:url('file://${thumb.replace(/\\/g,'/')}'); background-size:auto 100%; background-repeat:repeat-x; background-blend-mode:overlay;`
    : '';
  return `
    <div class="timeline-clip ${i === AppState.selectedClipIndex ? 'selected' : ''}"
         data-index="${i}"
         style="left:${left}px; width:${Math.max(w, 20)}px; ${bgStyle}"
         title="${escapeHtml(clip.label)}">
      <span class="timeline-clip-label">${escapeHtml(clip.label)}</span>
      <span class="timeline-clip-time">${formatTimePrecise(clip.startTime)} – ${formatTimePrecise(clip.endTime)}</span>
      <button class="timeline-clip-delete-btn" data-index="${i}" title="Delete clip">
        <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2" width="8" height="8">
          <line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/>
        </svg>
      </button>
    </div>`;
}

function attachTrackListeners(trackEl, pxPerSec) {
  trackEl.querySelectorAll('.timeline-clip').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.timeline-clip-delete-btn')) return;
      AppState.selectedClipIndex = parseInt(el.dataset.index);
      renderTimeline();
      updateInspector();
      // Load the clip's source video into the player and seek to the clip start
      const clip   = AppState.clips[AppState.selectedClipIndex];
      const source = clip && AppState.mediaItems[clip.sourceIndex];
      if (clip && source) {
        const video = document.getElementById('video-player');
        const targetSrc = 'file://' + source.filePath.replace(/\\/g, '/');
        if (!video.src || !video.src.endsWith(encodeURI(source.filePath.replace(/\\/g, '/')))) {
          video.src = targetSrc;
          video.load();
          video.addEventListener('loadedmetadata', () => {
            video.currentTime = clip.startTime;
          }, { once: true });
        } else {
          video.currentTime = clip.startTime;
        }
        // Show player, hide empty state
        document.getElementById('preview-empty')?.classList.add('hidden');
        video.style.display = 'block';
      }
    });
  });

  trackEl.querySelectorAll('.timeline-clip-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      AppState.clips.splice(idx, 1);
      if (AppState.selectedClipIndex >= AppState.clips.length)
        AppState.selectedClipIndex = AppState.clips.length - 1;
      renderTimeline();
      updateInspector();
      setStatus('Clip deleted');
      autoSaveProject();
    });
  });

  trackEl.addEventListener('click', (e) => {
    if (e.target.closest('.timeline-clip')) return;
    const rect = trackEl.getBoundingClientRect();
    const x    = e.clientX - rect.left + (trackEl.parentElement?.scrollLeft || 0);
    seekToTimelineX(x, pxPerSec);
  });
}

function renderTimeline() {
  const track     = document.getElementById('timeline-track');
  const track2    = document.getElementById('timeline-track-2');
  const badge     = document.getElementById('clip-count');
  const empty     = document.getElementById('timeline-empty');
  const workspace = document.getElementById('timeline-workspace');

  badge.textContent = `${AppState.clips.length} clip${AppState.clips.length !== 1 ? 's' : ''}`;

  if (AppState.clips.length === 0) {
    empty?.classList.remove('hidden');
    workspace?.classList.add('hidden');
    updateZoomLabel();
    return;
  }

  empty?.classList.add('hidden');
  workspace?.classList.remove('hidden');

  const pxPerSec = AppState.timelineZoom;

  // Split clips by track (default trackIndex 0 = Track 1, 1 = Track 2)
  const track1Clips = AppState.clips.filter(c => (c.trackIndex || 0) === 0);
  const track2Clips = AppState.clips.filter(c => (c.trackIndex || 0) === 1);

  // Total duration = max of both tracks
  const t1Dur = track1Clips.reduce((s, c) => s + Math.max(0, c.endTime - c.startTime), 0);
  const t2Dur = track2Clips.reduce((s, c) => s + Math.max(0, c.endTime - c.startTime), 0);
  const totalDur   = Math.max(t1Dur, t2Dur);
  const totalWidth = Math.max(totalDur * pxPerSec, 800);

  // ------ Track 1 HTML ------
  let cursor1 = 0;
  const t1Html = track1Clips.map((clip) => {
    const i   = AppState.clips.indexOf(clip);
    const dur = Math.max(0, clip.endTime - clip.startTime);
    const w   = dur * pxPerSec;
    const left = cursor1;
    cursor1   += w;
    return buildClipHtml(clip, i, left, w);
  }).join('');

  // ------ Track 2 HTML ------
  let cursor2 = 0;
  const t2Html = track2Clips.map((clip) => {
    const i   = AppState.clips.indexOf(clip);
    const dur = Math.max(0, clip.endTime - clip.startTime);
    const w   = dur * pxPerSec;
    const left = cursor2;
    cursor2   += w;
    return buildClipHtml(clip, i, left, w);
  }).join('');

  // ------ Render Track 1 ------
  if (track) {
    track.style.width = totalWidth + 'px';
    track.innerHTML = t1Html + `<div id="timeline-playhead" class="timeline-playhead" style="left:0">
        <div class="timeline-playhead-head"></div>
        <div class="timeline-playhead-line"></div>
      </div>`;
    attachTrackListeners(track, pxPerSec);
  }

  // ------ Render Track 2 ------
  if (track2) {
    track2.style.width = totalWidth + 'px';
    track2.innerHTML = t2Html;
    attachTrackListeners(track2, pxPerSec);
  }

  // ------ Ruler + scroll sync ------
  buildTimelineRuler(totalWidth, pxPerSec);
  syncTimelineScroll();
  updateTimelinePlayhead();
  updateZoomLabel();
}

function buildTimelineRuler(totalWidth, pxPerSec) {
  const ruler = document.getElementById('timeline-ruler');
  if (!ruler) return;
  ruler.style.width = totalWidth + 'px';

  // Choose tick interval based on zoom
  let majorInterval = 10; // seconds between major ticks
  if (pxPerSec >= 150) majorInterval = 1;
  else if (pxPerSec >= 60) majorInterval = 5;
  else if (pxPerSec >= 20) majorInterval = 10;
  else if (pxPerSec >= 8)  majorInterval = 30;
  else                     majorInterval = 60;

  const minorInterval = majorInterval / 5;
  const totalSeconds  = totalWidth / pxPerSec;

  let html = '';
  for (let t = 0; t <= totalSeconds + minorInterval; t += minorInterval) {
    const x       = t * pxPerSec;
    const isMajor = Math.abs(t % majorInterval) < 0.001 || Math.abs(t % majorInterval - majorInterval) < 0.001;
    const label   = isMajor ? formatTimeCompact(t) : '';
    html += `<div class="timeline-ruler-tick" style="left:${x}px">
      ${label ? `<span class="timeline-ruler-tick-label">${label}</span>` : ''}
      <div class="timeline-ruler-tick-line ${isMajor ? 'timeline-ruler-tick-line--major' : 'timeline-ruler-tick-line--minor'}"></div>
    </div>`;
  }
  ruler.innerHTML = html;
}

function syncTimelineScroll() {
  const clipScroll  = document.getElementById('timeline-clips-scroll');
  const clipScroll2 = document.getElementById('timeline-clips-scroll-2');
  const rulerRow    = document.querySelector('.timeline-ruler-row');
  if (!clipScroll) return;

  // Remove old scroll listener
  clipScroll._scrollHandler && clipScroll.removeEventListener('scroll', clipScroll._scrollHandler);
  clipScroll._scrollHandler = () => {
    const sl = clipScroll.scrollLeft;
    document.getElementById('timeline-ruler').style.transform = `translateX(-${sl}px)`;
    // Sync track 2 scroll
    if (clipScroll2 && clipScroll2.scrollLeft !== sl) clipScroll2.scrollLeft = sl;
  };
  clipScroll.addEventListener('scroll', clipScroll._scrollHandler);

  // Sync track 2 → track 1
  if (clipScroll2) {
    clipScroll2._scrollHandler && clipScroll2.removeEventListener('scroll', clipScroll2._scrollHandler);
    clipScroll2._scrollHandler = () => {
      if (clipScroll.scrollLeft !== clipScroll2.scrollLeft) clipScroll.scrollLeft = clipScroll2.scrollLeft;
    };
    clipScroll2.addEventListener('scroll', clipScroll2._scrollHandler);
  }

  // Ruler drag-to-scrub
  if (rulerRow && !rulerRow._scrubAttached) {
    rulerRow._scrubAttached = true;
    let scrubbing = false;

    function getScrubX(e) {
      const scrollEl = document.getElementById('timeline-clips-scroll');
      const rulerRect = rulerRow.getBoundingClientRect();
      const gutterW   = 52; // .timeline-track-gutter width
      return (e.clientX - rulerRect.left - gutterW) + (scrollEl?.scrollLeft || 0);
    }

    rulerRow.addEventListener('mousedown', (e) => {
      scrubbing = true;
      rulerRow.classList.add('scrubbing');
      const x = getScrubX(e);
      if (x >= 0) seekToTimelineX(x, AppState.timelineZoom);
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!scrubbing) return;
      const x = getScrubX(e);
      if (x >= 0) seekToTimelineX(x, AppState.timelineZoom);
    });
    document.addEventListener('mouseup', () => {
      if (!scrubbing) return;
      scrubbing = false;
      rulerRow.classList.remove('scrubbing');
    });
  }
}

function seekToTimelineX(x, pxPerSec) {
  const totalDur = AppState.clips.reduce((sum, c) => sum + Math.max(0, c.endTime - c.startTime), 0);
  const seekSec  = x / pxPerSec;
  if (seekSec < 0 || seekSec > totalDur) return;

  // Find which clip this time falls in and seek the video to the right position
  let accumulated = 0;
  for (const clip of AppState.clips) {
    const dur = clip.endTime - clip.startTime;
    if (seekSec <= accumulated + dur) {
      const offsetInClip = seekSec - accumulated;
      const video = document.getElementById('video-player');
      if (video.src) video.currentTime = clip.startTime + offsetInClip;
      return;
    }
    accumulated += dur;
  }
}

function updateTimelinePlayhead() {
  const playhead = document.getElementById('timeline-playhead');
  if (!playhead || AppState.clips.length === 0) return;

  const video = document.getElementById('video-player');
  const t     = video?.currentTime || 0;
  const pxPerSec = AppState.timelineZoom;

  // Find position of current time within the sequential clip layout
  let accumulated = 0;
  let playheadX   = 0;
  for (const clip of AppState.clips) {
    const dur = clip.endTime - clip.startTime;
    if (t >= clip.startTime && t <= clip.endTime) {
      playheadX = (accumulated + (t - clip.startTime)) * pxPerSec;
      break;
    }
    accumulated += dur;
    playheadX = accumulated * pxPerSec; // past all clips
  }

  playhead.style.left = playheadX + 'px';
}

function formatTimeCompact(secs) {
  const s = Math.floor(secs);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
  return `${m}:${String(s % 60).padStart(2,'0')}`;
}

function deleteSelectedClip() {
  if (AppState.selectedClipIndex < 0) return;
  AppState.clips.splice(AppState.selectedClipIndex, 1);
  AppState.selectedClipIndex = -1;
  renderTimeline();
  updateInspector();
  setStatus('Clip deleted');
  autoSaveProject();
}

// ---------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------
function updateInspector() {
  const container = document.getElementById('inspector-content');
  const clip = AppState.clips[AppState.selectedClipIndex];
  if (!clip) { container.innerHTML = '<div class="empty-state"><p>Select a clip or subtitle to inspect.</p></div>'; return; }
  const dur = clip.endTime - clip.startTime;
  container.innerHTML = `
    <div class="inspector-field"><label>Clip</label><div class="inspector-value">${clip.label}</div></div>
    <div class="inspector-field"><label>Start</label><div class="inspector-value">${formatTime(clip.startTime)}</div></div>
    <div class="inspector-field"><label>End</label><div class="inspector-value">${formatTime(clip.endTime)}</div></div>
    <div class="inspector-field"><label>Duration</label><div class="inspector-value">${formatTime(dur)}</div></div>
    <div style="margin-top:12px"><button class="btn btn-sm btn-secondary" onclick="deleteSelectedClip()">Delete Clip</button></div>`;
}

// ---------------------------------------------------------------------------
// Subtitles — full engine with timing editors + AI generation
// ---------------------------------------------------------------------------
function initSubtitles() {
  document.getElementById('btn-add-subtitle')?.addEventListener('click', addSubtitle);
  initWhisperUI();
}

function addSubtitle() {
  const video = document.getElementById('video-player');
  const startTime = video?.currentTime || 0;
  AppState.subtitles.push({
    id: generateId(), startTime, endTime: startTime + 3,
    text: 'New subtitle', stylePresetId: AppState.activeStylePreset,
    displayMode: 'full-line', alignment: 'center', position: 'bottom',
  });
  renderSubtitleList();
  setStatus('Subtitle added');
}

function renderSubtitleList() {
  const container = document.getElementById('subtitle-list');
  if (AppState.subtitles.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No subtitles yet. Click <strong>+ Add</strong> to add manually or <strong>AI Generate</strong> to auto-transcribe.</p></div>';
    return;
  }

  container.innerHTML = AppState.subtitles.map((sub, i) => `
    <div class="subtitle-block ${i === AppState.selectedSubtitleIndex ? 'selected' : ''}" data-index="${i}">
      <div class="sub-timing-row">
        <input class="sub-time-input" data-sub-index="${i}" data-field="startTime"
               value="${formatTimePrecise(sub.startTime)}" title="Start time (HH:MM:SS.ms)">
        <span class="sub-timing-arrow">→</span>
        <input class="sub-time-input" data-sub-index="${i}" data-field="endTime"
               value="${formatTimePrecise(sub.endTime)}" title="End time (HH:MM:SS.ms)">
      </div>
      <div class="sub-text" contenteditable="true" data-sub-index="${i}">${escapeHtml(sub.text)}</div>
      <div class="sub-actions">
        <button class="btn btn-sm btn-ghost" data-action="goto" data-index="${i}" title="Jump to this subtitle">▶ Go</button>
        <button class="btn btn-sm btn-ghost" data-action="duplicate" data-index="${i}">Duplicate</button>
        <button class="btn btn-sm btn-ghost" data-action="delete" data-index="${i}" style="color:var(--danger)">Delete</button>
      </div>
    </div>`).join('');

  // Select on click
  container.querySelectorAll('.subtitle-block').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.matches('.sub-time-input, [contenteditable], button')) return;
      AppState.selectedSubtitleIndex = parseInt(el.dataset.index);
      renderSubtitleList();
    });
  });

  // Inline text editing
  container.querySelectorAll('[contenteditable]').forEach(el => {
    el.addEventListener('blur', () => {
      const idx = parseInt(el.dataset.subIndex);
      if (AppState.subtitles[idx]) AppState.subtitles[idx].text = el.textContent.trim();
    });
    el.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.blur(); } });
  });

  // Timing inputs
  container.querySelectorAll('.sub-time-input').forEach(input => {
    input.addEventListener('change', () => {
      const idx   = parseInt(input.dataset.subIndex);
      const field = input.dataset.field;
      const secs  = parseTimeInput(input.value);
      if (secs !== null && AppState.subtitles[idx]) {
        AppState.subtitles[idx][field] = secs;
        input.value = formatTimePrecise(secs);
        setStatus(`Subtitle ${field === 'startTime' ? 'start' : 'end'} updated`);
      } else {
        input.value = formatTimePrecise(AppState.subtitles[idx]?.[field] || 0);
      }
    });
  });

  // Action buttons
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      switch (btn.dataset.action) {
        case 'duplicate': duplicateSubtitle(idx); break;
        case 'delete':    deleteSubtitle(idx); break;
        case 'goto':      jumpToSubtitle(idx); break;
      }
    });
  });
}

function jumpToSubtitle(index) {
  const sub   = AppState.subtitles[index];
  const video = document.getElementById('video-player');
  if (sub && video.src) { video.currentTime = sub.startTime; }
}

function duplicateSubtitle(index) {
  const orig = AppState.subtitles[index];
  if (!orig) return;
  const dur = orig.endTime - orig.startTime;
  AppState.subtitles.splice(index + 1, 0,
    { ...orig, id: generateId(), startTime: orig.endTime, endTime: orig.endTime + dur });
  renderSubtitleList();
  setStatus('Subtitle duplicated');
}

function deleteSubtitle(index) {
  AppState.subtitles.splice(index, 1);
  if (AppState.selectedSubtitleIndex >= AppState.subtitles.length)
    AppState.selectedSubtitleIndex = AppState.subtitles.length - 1;
  renderSubtitleList();
  setStatus('Subtitle deleted');
}

function updateSubtitleOverlay(currentTime) {
  const overlay   = document.getElementById('subtitle-overlay');
  const activeSub = AppState.subtitles.find(s => currentTime >= s.startTime && currentTime <= s.endTime);
  if (activeSub) {
    const preset = AppState.stylePresets[activeSub.stylePresetId] || {};
    const shadow  = preset.shadow ? '2px 2px 4px rgba(0,0,0,0.8)' : 'none';
    overlay.innerHTML = `<span class="subtitle-text ${preset.backgroundBox ? 'has-bg' : ''}" style="
      font-family:${preset.fontFamily||'Arial'};
      font-size:${preset.fontSize||32}px;
      font-weight:${preset.fontWeight||700};
      color:${preset.textColor||'#fff'};
      -webkit-text-stroke:${preset.outlineThickness||0}px ${preset.outlineColor||'#000'};
      text-shadow:${shadow};
    ">${escapeHtml(activeSub.text)}</span>`;
  } else {
    overlay.innerHTML = '';
  }
}

// ---------------------------------------------------------------------------
// Whisper AI subtitle generation
// ---------------------------------------------------------------------------
async function initWhisperUI() {
  const btn     = document.getElementById('btn-generate-subtitles');
  const controls = document.getElementById('whisper-controls');
  const banner  = document.getElementById('whisper-not-detected-banner');
  const btnRun  = document.getElementById('btn-whisper-run');
  const btnCancel = document.getElementById('btn-whisper-cancel');

  // Helper: guard click — require a loaded video
  function requireVideo() {
    if (AppState.activeMediaIndex < 0 || !AppState.mediaItems[AppState.activeMediaIndex]) {
      setStatus('⚠ Select a video first before generating subtitles.');
      return false;
    }
    return true;
  }

  // Check Whisper availability
  let whisperAvailable = false;
  try {
    const result = await window.electronAPI.invoke('whisper:check');
    whisperAvailable = !!(result && result.available);
    if (whisperAvailable) {
      const firstRun = await window.electronAPI.invoke('app:is-first-run');
      if (firstRun) await window.electronAPI.invoke('setup:mark-complete');
    }
  } catch { /* network/IPC error — treat as not available */ }

  if (whisperAvailable) {
    banner?.classList.add('hidden');
    btn?.addEventListener('click', () => {
      if (!requireVideo()) return;
      controls.classList.toggle('hidden');
    });
  } else {
    // Show warning banner — send user to Settings to install
    banner?.classList.remove('hidden');
    btn?.addEventListener('click', () => {
      if (!requireVideo()) return;
      // Show the banner briefly to remind user to go to Settings
      banner?.classList.remove('hidden');
      setStatus('⚠ Whisper AI not detected — go to Settings to install it.');
    });
  }

  // "Go to Settings" button inside the warning banner
  document.getElementById('btn-go-to-settings-whisper')?.addEventListener('click', () => {
    // Navigate to Settings view via sidebar nav button
    document.querySelector('.sidebar-btn[data-view="settings"]')?.click();
  });

  btnCancel?.addEventListener('click', () => {
    controls.classList.add('hidden');
    document.getElementById('whisper-progress')?.classList.add('hidden');
  });

  btnRun?.addEventListener('click', runWhisperGeneration);

  // Listen for generation progress events from main process
  window.electronAPI.on('whisper:progress', (progress) => {
    const bar  = document.getElementById('whisper-progress-fill');
    const text = document.getElementById('whisper-progress-text');
    if (bar && progress.percent != null) bar.style.width = `${progress.percent}%`;
    if (text) text.textContent = progress.message || '…';
  });
}

async function runWhisperGeneration() {
  const activeMedia = AppState.mediaItems[AppState.activeMediaIndex];
  if (!activeMedia) {
    setStatus('No video loaded. Import and select a video first.');
    return;
  }

  const model       = document.getElementById('whisper-model').value;
  const progressBox = document.getElementById('whisper-progress');
  const progressFill = document.getElementById('whisper-progress-fill');
  const progressText = document.getElementById('whisper-progress-text');
  const btnRun      = document.getElementById('btn-whisper-run');

  progressBox.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = 'Starting…';
  btnRun.disabled = true;
  setStatus('AI subtitle generation started…');

  try {
    const subtitles = await window.electronAPI.invoke('whisper:generate', activeMedia.filePath, model);

    if (!subtitles || subtitles.length === 0) {
      setStatus('Whisper returned no subtitles. Try a larger model or check your audio.');
      return;
    }

    // Merge or replace — if no existing subtitles just replace; else append
    if (AppState.subtitles.length === 0) {
      AppState.subtitles = subtitles;
    } else {
      const confirmed = confirm(
        `AI generated ${subtitles.length} subtitles.\n` +
        'Replace existing subtitles, or Cancel to append?'
      );
      if (confirmed) {
        AppState.subtitles = subtitles;
      } else {
        AppState.subtitles.push(...subtitles);
      }
    }

    renderSubtitleList();
    document.getElementById('whisper-controls').classList.add('hidden');
    setStatus(`✓ ${subtitles.length} AI subtitles imported`);
  } catch (err) {
    progressText.textContent = 'Error: ' + err.message;
    setStatus('Whisper failed — ' + err.message);
  } finally {
    btnRun.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Style Presets
// ---------------------------------------------------------------------------
function loadDefaultPresets() {
  AppState.stylePresets = [
    { name: 'Default White', fontFamily: 'Arial', fontSize: 42, fontWeight: 700, textColor: '#ffffff', outlineColor: '#000000', outlineThickness: 2, shadow: true, backgroundBox: false, displayMode: 'full-line' },
    { name: 'Bold Impact',   fontFamily: 'Impact', fontSize: 52, fontWeight: 400, textColor: '#ffff00', outlineColor: '#000000', outlineThickness: 3, shadow: true, backgroundBox: false, displayMode: 'chunk' },
    { name: 'Clean Box',     fontFamily: 'Segoe UI', fontSize: 36, fontWeight: 600, textColor: '#ffffff', outlineColor: '#000000', outlineThickness: 0, shadow: false, backgroundBox: true, displayMode: 'full-line' },
  ];
  AppState.exportPresets = [
    { name: 'TikTok',           platform: 'TikTok',     aspect: '9:16', resolution: '1080x1920', description: 'Vertical video for TikTok' },
    { name: 'YouTube Shorts',   platform: 'YouTube',    aspect: '9:16', resolution: '1080x1920', description: 'Vertical video for YouTube Shorts' },
    { name: 'Instagram Reels',  platform: 'Instagram',  aspect: '9:16', resolution: '1080x1920', description: 'Vertical video for Instagram Reels' },
    { name: 'Landscape 1080p',  platform: 'Standard',   aspect: '16:9', resolution: '1920x1080', description: 'Standard landscape HD video' },
  ];
  renderStylePresets();
  renderExportPresets();
}

function renderStylePresets() {
  const container = document.getElementById('style-presets-list');
  container.innerHTML = AppState.stylePresets.map((p, i) => `
    <div class="style-preset-item ${i === AppState.activeStylePreset ? 'active' : ''}" data-index="${i}">
      <span class="preset-preview" style="color:${p.textColor};font-family:${p.fontFamily};-webkit-text-stroke:1px ${p.outlineColor}">Aa</span>
      <span class="preset-name">${p.name}</span>
    </div>`).join('');
  container.querySelectorAll('.style-preset-item').forEach(el => {
    el.addEventListener('click', () => {
      AppState.activeStylePreset = parseInt(el.dataset.index);
      renderStylePresets();
      loadStyleEditor(AppState.activeStylePreset);
    });
  });
  loadStyleEditor(AppState.activeStylePreset);
}

function loadStyleEditor(index) {
  const p = AppState.stylePresets[index];
  if (!p) return;
  document.getElementById('style-font-family').value  = p.fontFamily;
  document.getElementById('style-font-size').value    = p.fontSize;
  document.getElementById('style-text-color').value   = p.textColor;
  document.getElementById('style-outline-color').value = p.outlineColor;
  document.getElementById('style-outline-size').value  = p.outlineThickness;
  document.getElementById('style-display-mode').value  = p.displayMode;
  document.getElementById('style-bg-box').checked      = p.backgroundBox;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
function initExport() {
  const fmt = document.getElementById('export-format');
  fmt.addEventListener('change', () => {
    document.getElementById('gif-options').classList.toggle('hidden', fmt.value !== 'gif');
  });
  document.getElementById('btn-export-render').addEventListener('click', startExport);
}

function renderExportPresets() {
  const grid = document.getElementById('export-preset-grid');
  grid.innerHTML = AppState.exportPresets.map((p, i) => `
    <div class="export-preset-card ${i === AppState.selectedExportPreset ? 'selected' : ''}" data-index="${i}">
      <div class="preset-card-title">${p.name}</div>
      <div class="preset-card-desc">${p.description}</div>
      <div class="preset-card-size">${p.resolution} (${p.aspect})</div>
    </div>`).join('');
  grid.querySelectorAll('.export-preset-card').forEach(el => {
    el.addEventListener('click', () => {
      AppState.selectedExportPreset = parseInt(el.dataset.index);
      document.getElementById('export-resolution').value = AppState.exportPresets[AppState.selectedExportPreset].resolution;
      renderExportPresets();
    });
  });
}

async function startExport() {
  if (AppState.clips.length === 0) { setStatus('No clips to export. Add clips to the timeline first.'); return; }

  const format     = document.getElementById('export-format').value;
  const resolution = document.getElementById('export-resolution').value;
  const quality    = document.getElementById('export-quality').value;
  const framing    = document.getElementById('export-framing').value;
  const burnSubs   = document.getElementById('export-burn-subs').checked;

  const ext         = format === 'gif' ? 'gif' : format === 'mp3' ? 'mp3' : 'mp4';
  const projectName = (AppState.project?.name || 'export').replace(/[\\/:*?"<>|]/g, '-');

  // Use saved export folder if set, otherwise show Save dialog
  let outputPath;
  try {
    const appSettings = await window.electronAPI.invoke('settings:get');
    if (appSettings.exportDir) {
      // Fixed folder: auto-generate filename, no dialog needed
      const ts       = new Date().toISOString().slice(0,19).replace(/[T:]/g,'-');
      const filename = `${projectName}_${ts}.${ext}`;
      outputPath     = appSettings.exportDir.replace(/[/\\]$/, '') + '\\' + filename;
    }
  } catch { /* fall through to dialog */ }

  if (!outputPath) {
    const saveResult = await window.electronAPI.invoke('dialog:save-file', {
      title: 'Save Export As',
      defaultPath: `${projectName}.${ext}`,
      filters: [
        { name: ext.toUpperCase(), extensions: [ext] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (saveResult.canceled || !saveResult.filePath) {
      setStatus('Export cancelled.');
      return;
    }
    outputPath = saveResult.filePath;
  }
  const progressEl   = document.getElementById('export-progress');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  progressEl.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = 'Preparing export...';

  const job = {
    id: generateId(), format, resolution, quality, framing,
    burnSubtitles: burnSubs,
    clips: AppState.clips,
    subtitles: burnSubs ? AppState.subtitles : [],
    stylePresets: AppState.stylePresets,
    outputPath,
  };

  try {
    if (format === 'gif') {
      const fps   = document.getElementById('gif-fps').value;
      const scale = document.getElementById('gif-scale').value;
      await window.electronAPI.invoke('export:gif', { ...job, fps, scale });
    } else {
      await window.electronAPI.invoke('export:render', job);
    }
    progressFill.style.width = '100%';
    progressText.textContent = 'Export complete!';
    setStatus('Export finished → ' + outputPath);
  } catch (err) {
    progressText.textContent = 'Export failed: ' + err.message;
    setStatus('Export failed');
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
function initSettings() {
  // Projects folder — browse
  document.getElementById('btn-browse-projects-dir')?.addEventListener('click', async () => {
    const chosen = await window.electronAPI.invoke('settings:pick-folder', 'Select Projects Folder');
    if (chosen) {
      document.getElementById('setting-projects-dir').value = chosen;
      await window.electronAPI.invoke('settings:set', { projectsDir: chosen });
      setStatus('Projects folder updated. New projects will be saved there.');
    }
  });
  // Projects folder — reset to default
  document.getElementById('btn-reset-projects-dir')?.addEventListener('click', async () => {
    await window.electronAPI.invoke('settings:set', { projectsDir: null });
    await loadAppSettings();
    setStatus('Projects folder reset to default.');
  });

  // Export folder — browse
  document.getElementById('btn-browse-export-dir')?.addEventListener('click', async () => {
    const chosen = await window.electronAPI.invoke('settings:pick-folder', 'Select Export Folder');
    if (chosen) {
      document.getElementById('setting-export-dir').value = chosen;
      await window.electronAPI.invoke('settings:set', { exportDir: chosen });
      setStatus('Export folder set. Exports will go there automatically.');
    }
  });
  // Export folder — clear (ask every time)
  document.getElementById('btn-clear-export-dir')?.addEventListener('click', async () => {
    await window.electronAPI.invoke('settings:set', { exportDir: null });
    document.getElementById('setting-export-dir').value = '';
    setStatus('Export folder cleared — you will be asked every time.');
  });

  // Refresh system versions button
  document.getElementById('btn-refresh-versions')?.addEventListener('click', loadSystemVersions);

  // Install Whisper from Settings page
  document.getElementById('btn-settings-install-whisper')?.addEventListener('click', installWhisperFromSettings);
}

// Load saved settings into the UI (called on startup and when opening Settings)
async function loadAppSettings() {
  try {
    const s = await window.electronAPI.invoke('settings:get');
    // Projects folder — always show the resolved path (custom or default)
    const projInput = document.getElementById('setting-projects-dir');
    if (projInput) projInput.value = s.projectsDirResolved || s.projectsDir || '';
    // Export folder — show custom path or leave blank (placeholder shows "Ask every time")
    const expInput = document.getElementById('setting-export-dir');
    if (expInput) expInput.value = s.exportDir || '';
  } catch { /* non-critical */ }
}

async function installWhisperFromSettings() {
  const btn      = document.getElementById('btn-settings-install-whisper');
  const progress = document.getElementById('settings-whisper-progress');
  const fill     = document.getElementById('settings-whisper-fill');
  const text     = document.getElementById('settings-whisper-text');

  if (btn) btn.disabled = true;
  progress?.classList.remove('hidden');

  const cleanup = window.electronAPI.on('whisper:install-progress', ({ percent, message }) => {
    if (fill) fill.style.width = `${percent || 0}%`;
    if (text) text.textContent = message || '…';
  });

  try {
    const result = await window.electronAPI.invoke('whisper:install');
    if (result && result.success) {
      if (text) text.textContent = 'Whisper AI installed successfully!';
      await loadSystemVersions();
    } else {
      if (text) text.textContent = 'Installation failed: ' + (result?.error || 'Unknown error');
    }
  } catch (err) {
    if (text) text.textContent = 'Error: ' + err.message;
  } finally {
    if (btn) btn.disabled = false;
    if (typeof cleanup === 'function') cleanup();
  }
}

async function loadSystemVersions() {
  const ffmpegEl  = document.getElementById('status-ffmpeg-ver');
  const pythonEl  = document.getElementById('status-python-ver');
  const whisperEl = document.getElementById('status-whisper-ver');
  const btn       = document.getElementById('btn-refresh-versions');

  if (ffmpegEl)  ffmpegEl.textContent  = 'Checking…';
  if (pythonEl)  pythonEl.textContent  = 'Checking…';
  if (whisperEl) whisperEl.textContent = 'Checking…';
  if (btn) btn.disabled = true;

  try {
    const versions = await window.electronAPI.invoke('system:check-versions');

    if (ffmpegEl)  { ffmpegEl.textContent  = versions.ffmpeg  || '–'; setVersionBadge(ffmpegEl,  versions.ffmpeg); }
    if (pythonEl)  { pythonEl.textContent  = versions.python  || '–'; setVersionBadge(pythonEl,  versions.python); }
    if (whisperEl) { whisperEl.textContent = versions.whisper || '–'; setVersionBadge(whisperEl, versions.whisper); }

    // Show install button if Whisper is not installed
    const whisperMissing = !versions.whisper || versions.whisper === 'Not installed' || versions.whisper.includes('Error');
    const installArea = document.getElementById('settings-whisper-install-area');
    installArea?.classList.toggle('hidden', !whisperMissing);

    // Reset install progress if whisper is now installed
    if (!whisperMissing) {
      document.getElementById('settings-whisper-progress')?.classList.add('hidden');
    }
  } catch (err) {
    if (ffmpegEl)  ffmpegEl.textContent  = 'Error';
    if (pythonEl)  pythonEl.textContent  = 'Error';
    if (whisperEl) whisperEl.textContent = 'Error';
  } finally {
    if (btn) btn.disabled = false;
  }
}

function setVersionBadge(el, ver) {
  if (!el) return;
  const installed = ver && ver !== '–' && !ver.includes('Not installed') && !ver.includes('Error') && ver.trim() !== '';
  el.classList.toggle('version-ok',  installed);
  el.classList.toggle('version-bad', !installed);
}

// ---------------------------------------------------------------------------
// Keyboard Shortcuts
// ---------------------------------------------------------------------------
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, [contenteditable]')) return;
    switch (e.key) {
      case ' ':          e.preventDefault(); togglePlay(); break;
      case 'i': case 'I': markIn(); break;
      case 'o': case 'O': markOut(); break;
      case 'Delete': case 'Backspace':
        if (AppState.currentView === 'editor') {
          if (AppState.activeEditorTab === 'timeline' && AppState.selectedClipIndex >= 0) deleteSelectedClip();
          if (AppState.activeEditorTab === 'subtitles' && AppState.selectedSubtitleIndex >= 0) deleteSubtitle(AppState.selectedSubtitleIndex);
        }
        break;
      case 'ArrowLeft':  nudgePlayhead(-1); break;
      case 'ArrowRight': nudgePlayhead(1); break;
      case 'ArrowUp':    nudgePlayhead(-5); break;
      case 'ArrowDown':  nudgePlayhead(5); break;
    }
  });
}

function nudgePlayhead(seconds) {
  const video = document.getElementById('video-player');
  if (!video.src) return;
  video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
}

// ---------------------------------------------------------------------------
// Main Process Event Listeners
// ---------------------------------------------------------------------------
function initMainProcessListeners() {
  window.electronAPI.on('project:loaded', (project) => {
    loadProjectData(project);
    setTimeout(loadRecentProjects, 300); // Refresh recent list after file is written
  });

  window.electronAPI.on('media:imported', (mediaItems) => {
    AppState.mediaItems.push(...mediaItems);
    renderMediaList();
    if (AppState.activeMediaIndex < 0 && mediaItems.length > 0) selectMedia(0);
    setStatus(`${mediaItems.length} file(s) imported`);
    // Auto-save so media persists when the project is reopened
    autoSaveProject();
  });

  window.electronAPI.on('export:progress', (progress) => {
    const fill = document.getElementById('progress-fill');
    const text = document.getElementById('progress-text');
    if (fill) fill.style.width = `${progress.percent || 0}%`;
    if (text) text.textContent = progress.message || `${Math.round(progress.percent || 0)}%`;
  });

  window.electronAPI.on('menu:new-project', () => createNewProject());
  window.electronAPI.on('menu:save-project', () => saveProject());
  window.electronAPI.on('menu:about', () => switchView('settings'));
}

// ---------------------------------------------------------------------------
// App Version
// ---------------------------------------------------------------------------
async function loadAppVersion() {
  try {
    const version = await window.electronAPI.invoke('app:get-version');
    const tag = `v${version}`;
    const settingsEl = document.getElementById('settings-version');
    if (settingsEl) settingsEl.textContent = tag;
    const dropdownEl = document.querySelector('.logo-dropdown-version');
    if (dropdownEl) dropdownEl.textContent = tag;
  } catch (err) {
    console.warn('Could not load app version:', err.message);
  }
}

// ---------------------------------------------------------------------------
// FFmpeg Check
// ---------------------------------------------------------------------------
async function checkFFmpeg() {
  // Status-bar FFmpeg indicator has been removed — result only shown in Settings
  try {
    await window.electronAPI.invoke('ffmpeg:check');
  } catch {
    // silent — FFmpeg status is visible on the Settings page
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function setStatus(text) {
  document.getElementById('status-text').textContent = text;
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

/** HH:MM:SS.ms format for subtitle timing inputs */
function formatTimePrecise(seconds) {
  if (seconds == null || isNaN(seconds)) return '00:00:00.000';
  const h   = Math.floor(seconds / 3600);
  const m   = Math.floor((seconds % 3600) / 60);
  const s   = Math.floor(seconds % 60);
  const ms  = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
}

/** Parse HH:MM:SS.ms or HH:MM:SS,ms or bare seconds string → seconds (number) or null */
function parseTimeInput(str) {
  if (!str) return null;
  // Normalise comma to dot
  const s = str.trim().replace(',', '.');
  // Already a number?
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  // HH:MM:SS.ms or MM:SS.ms or SS.ms
  const parts = s.split(':');
  if (parts.length === 3) {
    const [h, m, sec] = parts.map(Number);
    if ([h, m, sec].some(isNaN)) return null;
    return h * 3600 + m * 60 + sec;
  }
  if (parts.length === 2) {
    const [m, sec] = parts.map(Number);
    if ([m, sec].some(isNaN)) return null;
    return m * 60 + sec;
  }
  return null;
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B','KB','MB','GB'];
  let i = 0, size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(1)} ${units[i]}`;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Expose for inline onclick handlers
window.deleteSelectedClip = deleteSelectedClip;
