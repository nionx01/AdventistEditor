/**
 * AdventistEditor — Preload Script
 *
 * This script runs in a sandboxed context before the renderer loads.
 * It exposes a safe, typed API to the renderer via contextBridge.
 *
 * Security:
 * - contextIsolation is enabled
 * - nodeIntegration is disabled
 * - Only specific IPC channels are whitelisted
 */

const { contextBridge, ipcRenderer } = require('electron');

// Whitelist of channels the renderer is allowed to invoke
const INVOKE_CHANNELS = [
  'settings:get',
  'settings:set',
  'settings:pick-folder',
  'project:create',
  'project:save',
  'project:save-to-path',
  'project:open',
  'project:open-by-path',
  'project:get-recent',
  'project:remove-from-recent',
  'project:delete-from-disk',
  'media:import',
  'media:get-info',
  'media:generate-thumbnail',
  'export:render',
  'export:gif',
  'ffmpeg:check',
  'audio:extract',
  'audio:replace',
  'audio:mute',
  'whisper:generate',
  'whisper:check',
  'whisper:install',
  'dialog:save-file',
  'dialog:open-file',
  'app:get-version',
  'app:get-path',
  'app:is-packaged',
  'app:is-first-run',
  'app:quit',
  'app:reload',
  'app:toggle-devtools',
  'app:fullscreen',
  'setup:mark-complete',
  'system:check-versions',
];

// Whitelist of channels the renderer is allowed to listen to
const LISTEN_CHANNELS = [
  'project:loaded',
  'media:imported',
  'export:progress',
  'menu:new-project',
  'menu:save-project',
  'menu:about',
  'whisper:progress',
  'whisper:install-progress',
];

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Invoke an IPC handler in the main process and await the result.
   * @param {string} channel - Must be in the INVOKE_CHANNELS whitelist
   * @param {...any} args - Arguments forwarded to the handler
   */
  invoke: (channel, ...args) => {
    if (!INVOKE_CHANNELS.includes(channel)) {
      throw new Error(`IPC invoke blocked: channel "${channel}" is not whitelisted`);
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  /**
   * Listen for messages from the main process.
   * @param {string} channel - Must be in the LISTEN_CHANNELS whitelist
   * @param {Function} callback - Receives (...args) without the event object
   */
  on: (channel, callback) => {
    if (!LISTEN_CHANNELS.includes(channel)) {
      throw new Error(`IPC listen blocked: channel "${channel}" is not whitelisted`);
    }
    const wrappedCallback = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, wrappedCallback);
    // Return a cleanup function
    return () => ipcRenderer.removeListener(channel, wrappedCallback);
  },

  /**
   * Listen for a single message then auto-remove the listener.
   */
  once: (channel, callback) => {
    if (!LISTEN_CHANNELS.includes(channel)) {
      throw new Error(`IPC once blocked: channel "${channel}" is not whitelisted`);
    }
    ipcRenderer.once(channel, (_event, ...args) => callback(...args));
  },
});
