/**
 * AdventistEditor — SettingsService
 *
 * Persists user-level app settings to settings.json in userData.
 * Provides typed getters/setters with defaults.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  projectsDir: null,   // null = auto (Documents\ProjectsAdventistEditor)
  exportDir:   null,   // null = ask every time
};

class SettingsService {
  constructor() {
    const userData = app ? app.getPath('userData') : require('os').homedir();
    this._filePath = path.join(userData, 'settings.json');
    this._data = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this._filePath)) {
        return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(this._filePath, 'utf8')) };
      }
    } catch { /* ignore */ }
    return { ...DEFAULTS };
  }

  _save() {
    try {
      fs.writeFileSync(this._filePath, JSON.stringify(this._data, null, 2), 'utf8');
    } catch (err) {
      console.warn('SettingsService: could not save settings:', err.message);
    }
  }

  /** Return the full settings object */
  getAll() {
    return { ...this._data };
  }

  /** Update one or many keys and persist */
  set(updates) {
    Object.assign(this._data, updates);
    this._save();
    return this._data;
  }

  /** Resolved projects directory — falls back to Documents\ProjectsAdventistEditor */
  getProjectsDir() {
    if (this._data.projectsDir && fs.existsSync(this._data.projectsDir)) {
      return this._data.projectsDir;
    }
    const docsFolder = app ? app.getPath('documents') : require('os').homedir();
    return path.join(docsFolder, 'ProjectsAdventistEditor');
  }

  /** Return both saved value and the fully resolved path (so UI can show the real path) */
  getAllResolved() {
    return {
      ...this._data,
      projectsDirResolved: this.getProjectsDir(),
    };
  }
}

module.exports = SettingsService;
