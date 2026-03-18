/**
 * AdventistEditor — ProjectService
 *
 * Handles creating, saving, and loading .aeproj project files.
 * Projects are stored as JSON on disk.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class ProjectService {
  /**
   * @param {import('./SettingsService')} settingsService - optional, for dynamic projectsDir
   */
  constructor(settingsService) {
    this._settings = settingsService || null;
    const docsFolder = app ? app.getPath('documents') : require('os').homedir();
    this._fallbackDir = path.join(docsFolder, 'ProjectsAdventistEditor');
    this._ensureDataDir();
  }

  /** Always resolves the current projects root (can change at runtime via Settings) */
  get defaultProjectsDir() {
    return this._settings ? this._settings.getProjectsDir() : this._fallbackDir;
  }

  get recentProjectsPath() {
    return path.join(this.defaultProjectsDir, 'recent-projects.json');
  }

  _ensureDataDir() {
    const dir = this.defaultProjectsDir;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Create a new project AND auto-save it to:
   *   Documents\ProjectsAdventistEditor\<ProjectName>\<ProjectName>.aeproj
   * Returns the project object with filePath attached.
   */
  createProject(name) {
    const safeName = (name || 'Untitled Project').replace(/[\\/:*?"<>|]/g, '-');

    // Each project gets its own folder; make it unique if it already exists
    const projectFolder = this._uniqueFolder(
      path.join(this.defaultProjectsDir, safeName)
    );
    fs.mkdirSync(projectFolder, { recursive: true });

    const filePath = path.join(projectFolder, `${path.basename(projectFolder)}.aeproj`);

    const project = {
      id: this._generateId(),
      name: name || 'Untitled Project',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: '1.0',
      filePath,
      settings: {
        defaultMode: 'advanced',
        exportFolder: projectFolder,   // export goes into the project's own folder
        ffmpegPath: '',
      },
      mediaItems: [],
      clips: [],
      subtitles: [],
      stylePresets: [],
      audioTracks: [],
      exportPresets: [],
      renderJobs: [],
    };

    this.saveProject(filePath, project);
    return project;
  }

  /** Returns a unique folder path if the name already exists (appends _2, _3, …) */
  _uniqueFolder(folderPath) {
    if (!fs.existsSync(folderPath)) return folderPath;
    let n = 2;
    while (fs.existsSync(`${folderPath}_${n}`)) n++;
    return `${folderPath}_${n}`;
  }

  /**
   * Save project data to a .aeproj file (JSON).
   */
  saveProject(filePath, projectData) {
    const data = {
      ...projectData,
      updatedAt: new Date().toISOString(),
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    this._addToRecent(filePath, data.name);
    return filePath;
  }

  /**
   * Load a project from a .aeproj file.
   */
  loadProject(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Project file not found: ${filePath}`);
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    let project;

    try {
      project = JSON.parse(raw);
    } catch {
      throw new Error('Invalid project file: could not parse JSON');
    }

    // Basic schema validation
    if (!project.id || !project.name) {
      throw new Error('Invalid project file: missing required fields');
    }

    this._addToRecent(filePath, project.name);
    return project;
  }

  /**
   * Load the recent projects list.
   */
  getRecentProjects() {
    try {
      if (fs.existsSync(this.recentProjectsPath)) {
        const data = JSON.parse(fs.readFileSync(this.recentProjectsPath, 'utf8'));
        return Array.isArray(data) ? data : [];
      }
    } catch {
      // ignore
    }
    return [];
  }

  /**
   * Permanently delete the project folder from disk AND remove from recents.
   * The project folder is the parent directory of the .aeproj file.
   */
  deleteProjectFromDisk(filePath) {
    // Remove from recents first (non-critical)
    this.removeFromRecent(filePath);

    const projectFolder  = path.dirname(filePath);
    const resolvedFolder = path.resolve(projectFolder);
    const resolvedRoot   = path.resolve(this.defaultProjectsDir);

    // Safety: only delete folders that live inside the projects root
    if (!resolvedFolder.startsWith(resolvedRoot + path.sep) &&
        resolvedFolder !== resolvedRoot) {
      throw new Error('Cannot delete: project is outside the projects directory.');
    }

    if (fs.existsSync(projectFolder)) {
      fs.rmSync(projectFolder, { recursive: true, force: true });
    }
    return true;
  }

  /**
   * Remove a project from the recent-projects list by filePath.
   */
  removeFromRecent(filePath) {
    try {
      let recent = this.getRecentProjects();
      recent = recent.filter(r => r.filePath !== filePath);
      fs.writeFileSync(this.recentProjectsPath, JSON.stringify(recent, null, 2), 'utf8');
    } catch {
      // Non-critical
    }
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------
  _addToRecent(filePath, name) {
    try {
      let recent = this.getRecentProjects();
      // Remove any existing entry for this path
      recent = recent.filter(r => r.filePath !== filePath);
      // Add at the front — use 'lastOpened' so renderer can reference it directly
      recent.unshift({ filePath, name, lastOpened: new Date().toISOString() });
      // Keep max 10 recent items
      recent = recent.slice(0, 10);
      fs.writeFileSync(this.recentProjectsPath, JSON.stringify(recent, null, 2), 'utf8');
    } catch {
      // Non-critical — ignore failures
    }
  }

  _generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
  }
}

module.exports = ProjectService;
