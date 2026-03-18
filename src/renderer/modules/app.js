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
  initTimeline();
  initSubtitles();
  initExport();
  initSettings();
  initKeyboardShortcuts();
  initMainProcessListeners();
  initProjectContextMenu();
  loadDefaultPresets();
  checkFFmpeg();
  loadAppVersion();
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
}

// ---------------------------------------------------------------------------
// Project open/close — shows/hides editor nav button + header actions
// ---------------------------------------------------------------------------
function setProjectOpen(isOpen) {
  const navEditor   = document.getElementById('nav-editor');
  const btnImport   = document.getElementById('btn-import');
  const btnSave     = document.getElementById('btn-save');
  const badge       = document.getElementById('project-name-badge');

  navEditor.classList.toggle('hidden', !isOpen);
  btnImport.classList.toggle('hidden', !isOpen);
  btnSave.classList.toggle('hidden', !isOpen);
  if (!isOpen) badge.classList.add('hidden');
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
          loadProjectData(proj);
          break;
        case 'export':
          // Load project, switch to editor, then open export tab
          loadProjectData(proj);
          setTimeout(() => {
            switchView('editor');
            switchEditorTab('export');
          }, 100);
          break;
        case 'archive':
          setStatus(`"${proj.name}" archived (feature coming soon)`);
          break;
        case 'delete':
          if (confirm(`Delete "${proj.name}" from recent projects?`)) {
            await removeFromRecentProjects(proj.filePath);
            loadRecentProjects();
          }
          break;
      }
    });
  });
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

  // Click card = open project
  container.querySelectorAll('.recent-project-card').forEach((card, i) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.recent-project-menu-btn')) return;
      loadProjectData(projects[i]);
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
  // ProjectService manages the recent list; we load it, filter, and save it back
  // (This will be handled gracefully by ProjectService in a future update)
  setStatus('Project removed from recents');
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

function renderMediaList() {
  const container = document.getElementById('media-list');
  if (AppState.mediaItems.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No media imported.</p>
        <button class="btn btn-sm btn-secondary btn-import-media">Import Files</button>
      </div>`;
    return;
  }

  container.innerHTML = AppState.mediaItems.map((item, i) => `
    <div class="media-item ${i === AppState.activeMediaIndex ? 'active' : ''}" data-index="${i}">
      <div class="media-name">${item.fileName || 'Unknown'}</div>
      <div class="media-meta">
        ${item.duration ? formatTime(item.duration) : '--:--'} &middot;
        ${item.resolution || '?'} &middot;
        ${item.fileSize ? formatFileSize(item.fileSize) : '?'}
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.media-item').forEach(el => {
    el.addEventListener('click', () => selectMedia(parseInt(el.dataset.index)));
  });
}

function selectMedia(index) {
  AppState.activeMediaIndex = index;
  const item = AppState.mediaItems[index];
  if (!item) return;
  renderMediaList();
  loadVideoInPlayer(item.filePath);
  setStatus(`Loaded: ${item.fileName}`);
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

  video.addEventListener('timeupdate', () => {
    if (video.duration) {
      seekbar.value = (video.currentTime / video.duration) * 100;
      updateTimeDisplay();
      updateSubtitleOverlay(video.currentTime);
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
  const video = document.getElementById('video-player');
  video.src = filePath;
  video.load();
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
function initTimeline() {}

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

function renderTimeline() {
  const container = document.getElementById('timeline-track');
  const badge     = document.getElementById('clip-count');
  badge.textContent = `${AppState.clips.length} clip${AppState.clips.length !== 1 ? 's' : ''}`;

  if (AppState.clips.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No clips on the timeline. Mark In/Out on your video to create clips.</p></div>';
    return;
  }

  container.innerHTML = AppState.clips.map((clip, i) => {
    const dur = clip.endTime - clip.startTime;
    return `
      <div class="timeline-clip ${i === AppState.selectedClipIndex ? 'selected' : ''}" data-index="${i}">
        <span class="clip-label">${escapeHtml(clip.label)}</span>
        <span class="clip-time">${formatTimePrecise(clip.startTime)} – ${formatTimePrecise(clip.endTime)} (${formatTimePrecise(dur)})</span>
        <button class="clip-delete-btn" data-index="${i}" title="Delete clip">
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" width="11" height="11">
            <line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/>
          </svg>
        </button>
      </div>`;
  }).join('');

  container.querySelectorAll('.timeline-clip').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.clip-delete-btn')) return;
      AppState.selectedClipIndex = parseInt(el.dataset.index);
      renderTimeline();
      updateInspector();
      // Jump video to clip start
      const clip  = AppState.clips[AppState.selectedClipIndex];
      const video = document.getElementById('video-player');
      if (clip && video.src) video.currentTime = clip.startTime;
    });
  });

  container.querySelectorAll('.clip-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      AppState.clips.splice(idx, 1);
      if (AppState.selectedClipIndex >= AppState.clips.length)
        AppState.selectedClipIndex = AppState.clips.length - 1;
      renderTimeline();
      updateInspector();
      setStatus('Clip deleted');
    });
  });
}

function deleteSelectedClip() {
  if (AppState.selectedClipIndex < 0) return;
  AppState.clips.splice(AppState.selectedClipIndex, 1);
  AppState.selectedClipIndex = -1;
  renderTimeline();
  updateInspector();
  setStatus('Clip deleted');
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
  const btn          = document.getElementById('btn-generate-subtitles');
  const controls     = document.getElementById('whisper-controls');
  const installBox   = document.getElementById('whisper-install-box');
  const btnInstall   = document.getElementById('btn-whisper-install');
  const btnRun       = document.getElementById('btn-whisper-run');
  const btnCancel    = document.getElementById('btn-whisper-cancel');

  // Check if Whisper is available; auto-install on first packaged run
  async function checkAndShowWhisper() {
    try {
      const result     = await window.electronAPI.invoke('whisper:check');
      const isPackaged = await window.electronAPI.invoke('app:is-packaged');
      const firstRun   = await window.electronAPI.invoke('app:is-first-run');

      if (result && result.available) {
        // Whisper ready — wire up the normal AI Generate button
        installBox?.classList.add('hidden');
        btn?.addEventListener('click', () => controls.classList.toggle('hidden'));
        // Mark setup complete if this is first run
        if (firstRun) await window.electronAPI.invoke('setup:mark-complete');
      } else {
        // Not installed — show install panel on button click
        btn?.addEventListener('click', () => {
          installBox?.classList.toggle('hidden');
          controls.classList.add('hidden');
        });

        // First launch of a packaged build → auto-open install panel and start install
        if (isPackaged && firstRun) {
          installBox?.classList.remove('hidden');
          // Small delay so the editor UI is fully rendered before kicking off the install
          setTimeout(() => btnInstall?.click(), 900);
        }
      }
    } catch {
      btn?.addEventListener('click', () => {
        installBox?.classList.toggle('hidden');
        controls.classList.add('hidden');
      });
    }
  }

  await checkAndShowWhisper();

  // Install button
  btnInstall?.addEventListener('click', async () => {
    const installProgress = document.getElementById('whisper-install-progress');
    const installFill     = document.getElementById('whisper-install-fill');
    const installText     = document.getElementById('whisper-install-text');

    btnInstall.disabled = true;
    btnInstall.textContent = 'Installing…';
    installProgress?.classList.remove('hidden');

    // Listen for install progress
    const cleanup = window.electronAPI.on('whisper:install-progress', (p) => {
      if (installFill && p.percent != null) installFill.style.width = `${p.percent}%`;
      if (installText) installText.textContent = p.message || '…';
    });

    try {
      const result = await window.electronAPI.invoke('whisper:install');
      if (result && result.success) {
        installText.textContent = '✓ Whisper AI installed successfully!';
        installFill.style.width = '100%';
        // After success swap to normal generate controls and mark setup done
        await window.electronAPI.invoke('setup:mark-complete');
        setTimeout(() => {
          installBox?.classList.add('hidden');
          btn?.addEventListener('click', () => controls.classList.toggle('hidden'));
          setStatus('✓ Whisper AI installed! Click AI Generate to create subtitles.');
        }, 1500);
      } else {
        installText.textContent = '✗ ' + (result?.error || 'Install failed');
        btnInstall.disabled = false;
        btnInstall.textContent = 'Retry Install';
      }
    } catch (err) {
      installText.textContent = '✗ ' + err.message;
      btnInstall.disabled = false;
      btnInstall.textContent = 'Retry Install';
    } finally {
      if (cleanup) cleanup();
    }
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
  const format   = document.getElementById('export-format').value;
  const resolution = document.getElementById('export-resolution').value;
  const quality  = document.getElementById('export-quality').value;
  const framing  = document.getElementById('export-framing').value;
  const burnSubs = document.getElementById('export-burn-subs').checked;
  const progressEl   = document.getElementById('export-progress');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  progressEl.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = 'Preparing export...';
  const job = { id: generateId(), format, resolution, quality, framing, burnSubtitles: burnSubs, clips: AppState.clips, subtitles: burnSubs ? AppState.subtitles : [], stylePresets: AppState.stylePresets };
  try {
    if (format === 'gif') {
      const fps = document.getElementById('gif-fps').value;
      const scale = document.getElementById('gif-scale').value;
      await window.electronAPI.invoke('export:gif', { ...job, fps, scale });
    } else {
      await window.electronAPI.invoke('export:render', job);
    }
    progressFill.style.width = '100%';
    progressText.textContent = 'Export complete!';
    setStatus('Export finished successfully');
  } catch (err) {
    progressText.textContent = 'Export failed: ' + err.message;
    setStatus('Export failed');
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
function initSettings() {
  document.getElementById('btn-browse-ffmpeg')?.addEventListener('click', async () => {
    const r = await window.electronAPI.invoke('dialog:open-file', { title: 'Select FFmpeg Binary', properties: ['openFile'] });
    if (!r.canceled && r.filePaths.length > 0) document.getElementById('ffmpeg-path').value = r.filePaths[0];
  });
  document.getElementById('btn-browse-export-folder')?.addEventListener('click', async () => {
    const r = await window.electronAPI.invoke('dialog:open-file', { title: 'Select Export Folder', properties: ['openDirectory'] });
    if (!r.canceled && r.filePaths.length > 0) document.getElementById('export-folder').value = r.filePaths[0];
  });
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
  const indicator = document.getElementById('status-ffmpeg');
  try {
    const result = await window.electronAPI.invoke('ffmpeg:check');
    if (result && result.available) {
      indicator.textContent = 'FFmpeg: ready';
      indicator.style.color = 'var(--color-success)';
    } else {
      indicator.textContent = 'FFmpeg: not found';
      indicator.style.color = 'var(--color-warning)';
    }
  } catch {
    indicator.textContent = 'FFmpeg: error';
    indicator.style.color = 'var(--color-error)';
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
