/**
 * AdventistEditor — Data Models
 *
 * This file defines the schema for every data structure used in the app.
 * Each model is documented with its fields and default factory functions.
 *
 * These models are used in:
 *   - Project files (.aeproj JSON)
 *   - In-memory AppState
 *   - IPC messages between main and renderer
 */

'use strict';

// ---------------------------------------------------------------------------
// Project
// The root object stored in .aeproj files.
// ---------------------------------------------------------------------------
function createProject(overrides = {}) {
  return {
    id: '',                       // Unique project ID
    name: 'Untitled Project',     // Human-readable project name
    version: '1.0',               // Schema version for migration support
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),

    // Settings
    settings: {
      defaultMode: 'advanced',    // 'quick' | 'advanced'
      exportFolder: '',           // Default export directory
      ffmpegPath: '',             // Custom FFmpeg binary path
    },

    // Collections
    mediaItems: [],               // SourceMedia[]
    clips: [],                    // TimelineClip[]
    subtitles: [],                // SubtitleBlock[]
    stylePresets: [],             // SubtitleStylePreset[]
    audioTracks: [],              // AudioTrack[]
    exportPresets: [],            // ExportPreset[]
    renderJobs: [],               // RenderJob[]

    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SourceMedia
// Represents an imported video or audio file.
// ---------------------------------------------------------------------------
function createSourceMedia(overrides = {}) {
  return {
    id: '',                       // Unique media ID
    filePath: '',                 // Absolute path on disk
    fileName: '',                 // Base filename with extension
    type: 'video',                // 'video' | 'audio'
    fileSize: 0,                  // Bytes
    duration: null,               // Seconds (float)
    resolution: null,             // e.g. '1920x1080'
    width: null,                  // Pixels
    height: null,                 // Pixels
    frameRate: null,              // e.g. 29.97
    bitrate: null,                // Bits per second
    hasAudio: true,
    hasVideo: true,
    codec: null,                  // e.g. 'h264', 'aac'
    thumbnailPath: null,          // Path to preview thumbnail image
    importedAt: new Date().toISOString(),

    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TimelineClip
// A trimmed segment of a SourceMedia placed on the timeline.
// ---------------------------------------------------------------------------
function createTimelineClip(overrides = {}) {
  return {
    id: '',                       // Unique clip ID
    sourceMediaId: '',            // References SourceMedia.id
    sourcePath: '',               // Absolute path to source file (convenience copy)
    startTime: 0,                 // In point within the source (seconds)
    endTime: 0,                   // Out point within the source (seconds)
    trackIndex: 0,                // Which track on the timeline (for multi-track future support)
    position: 0,                  // Position on timeline in seconds (when placed)
    label: 'Clip',
    color: null,                  // Optional label color
    muted: false,

    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SubtitleBlock
// A single subtitle entry with timing, text, and style.
// ---------------------------------------------------------------------------
function createSubtitleBlock(overrides = {}) {
  return {
    id: '',                       // Unique subtitle ID
    startTime: 0,                 // Seconds
    endTime: 3,                   // Seconds
    text: '',                     // The subtitle text
    stylePresetId: 0,             // Index into stylePresets array

    // Display
    displayMode: 'full-line',     // 'full-line' | 'chunk' | 'word-by-word' | 'highlight'
    alignment: 'center',          // 'left' | 'center' | 'right'
    position: 'bottom',           // 'bottom' | 'top' | 'middle'

    // Optional emphasis
    emphasis: {
      enabled: false,
      wordIndex: 0,               // Which word is currently highlighted (for word-by-word mode)
    },

    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SubtitleStylePreset
// A reusable set of subtitle appearance settings.
// ---------------------------------------------------------------------------
function createSubtitleStylePreset(overrides = {}) {
  return {
    id: '',
    name: 'New Preset',

    // Typography
    fontFamily: 'Arial',
    fontSize: 42,                 // px at 1080p
    fontWeight: 700,              // 400 | 700
    italic: false,

    // Color
    textColor: '#ffffff',
    outlineColor: '#000000',
    outlineThickness: 2,          // 0–8

    // Effects
    shadow: true,
    shadowColor: '#000000',
    shadowOffset: { x: 2, y: 2 },

    // Background box
    backgroundBox: false,
    backgroundColor: 'rgba(0,0,0,0.7)',
    backgroundPadding: 8,

    // Layout
    displayMode: 'full-line',     // same as SubtitleBlock but stored as default in preset
    maxLineWidth: 80,             // % of frame width
    lineHeight: 1.3,
    marginBottom: 40,             // px from bottom safe area (Shorts/TikTok safe margin)

    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// AudioTrack
// Represents a separate audio layer (e.g. background music).
// ---------------------------------------------------------------------------
function createAudioTrack(overrides = {}) {
  return {
    id: '',
    filePath: '',
    fileName: '',
    type: 'background',           // 'original' | 'background' | 'replacement'
    volume: 1.0,                  // 0.0–1.0
    muted: false,
    startTime: 0,                 // When this track starts on the timeline (seconds)
    duration: null,               // Null means full track duration
    fadeIn: 0,                    // Fade in duration (seconds)
    fadeOut: 0,                   // Fade out duration (seconds)

    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ExportPreset
// A named combination of export settings.
// ---------------------------------------------------------------------------
function createExportPreset(overrides = {}) {
  return {
    id: '',
    name: 'Custom Export',
    platform: null,               // 'TikTok' | 'YouTube' | 'Instagram' | null
    format: 'mp4',                // 'mp4' | 'gif'
    resolution: '1920x1080',      // WxH string
    aspect: '16:9',
    quality: 'balanced',          // 'high' | 'balanced' | 'fast'
    framing: 'fit',               // 'crop' | 'fit' | 'blur-fill' | 'center'
    burnSubtitles: true,
    description: '',

    // GIF-specific
    gifFps: 15,
    gifScale: 480,

    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// RenderJob
// Tracks a single export operation from start to finish.
// ---------------------------------------------------------------------------
function createRenderJob(overrides = {}) {
  return {
    id: '',
    projectId: '',
    status: 'queued',             // 'queued' | 'running' | 'done' | 'error'
    progress: 0,                  // 0–100
    message: '',

    // Input
    clips: [],                    // TimelineClip[] to render
    subtitles: [],                // SubtitleBlock[] to burn
    stylePresets: [],             // Referenced presets

    // Export settings
    format: 'mp4',
    resolution: '1920x1080',
    quality: 'balanced',
    framing: 'fit',
    burnSubtitles: true,
    outputPath: '',

    // Timestamps
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    errorMessage: null,

    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Default Preset Data
// Used when creating a new project to populate initial style & export presets
// ---------------------------------------------------------------------------
const DEFAULT_STYLE_PRESETS = [
  createSubtitleStylePreset({
    id: 'preset-default-white',
    name: 'Default White',
    fontFamily: 'Arial',
    fontSize: 42,
    textColor: '#ffffff',
    outlineColor: '#000000',
    outlineThickness: 2,
    backgroundBox: false,
    displayMode: 'full-line',
  }),
  createSubtitleStylePreset({
    id: 'preset-bold-impact',
    name: 'Bold Impact',
    fontFamily: 'Impact',
    fontSize: 52,
    fontWeight: 400,
    textColor: '#ffff00',
    outlineColor: '#000000',
    outlineThickness: 3,
    backgroundBox: false,
    displayMode: 'chunk',
  }),
  createSubtitleStylePreset({
    id: 'preset-clean-box',
    name: 'Clean Box',
    fontFamily: 'Segoe UI',
    fontSize: 36,
    fontWeight: 600,
    textColor: '#ffffff',
    outlineThickness: 0,
    backgroundBox: true,
    backgroundColor: 'rgba(0,0,0,0.75)',
    displayMode: 'full-line',
  }),
  createSubtitleStylePreset({
    id: 'preset-tiktok-chunky',
    name: 'TikTok Chunky',
    fontFamily: 'Arial',
    fontSize: 48,
    fontWeight: 700,
    textColor: '#ffffff',
    outlineColor: '#000000',
    outlineThickness: 3,
    backgroundBox: false,
    displayMode: 'chunk',
    marginBottom: 60,
  }),
];

const DEFAULT_EXPORT_PRESETS = [
  createExportPreset({
    id: 'preset-tiktok',
    name: 'TikTok',
    platform: 'TikTok',
    format: 'mp4',
    resolution: '1080x1920',
    aspect: '9:16',
    quality: 'high',
    framing: 'crop',
    description: 'Vertical video for TikTok (9:16, 1080×1920)',
  }),
  createExportPreset({
    id: 'preset-yt-shorts',
    name: 'YouTube Shorts',
    platform: 'YouTube',
    format: 'mp4',
    resolution: '1080x1920',
    aspect: '9:16',
    quality: 'high',
    framing: 'crop',
    description: 'Vertical video for YouTube Shorts',
  }),
  createExportPreset({
    id: 'preset-ig-reels',
    name: 'Instagram Reels',
    platform: 'Instagram',
    format: 'mp4',
    resolution: '1080x1920',
    aspect: '9:16',
    quality: 'high',
    framing: 'crop',
    description: 'Vertical video for Instagram Reels',
  }),
  createExportPreset({
    id: 'preset-landscape',
    name: 'Landscape 1080p',
    platform: 'Standard',
    format: 'mp4',
    resolution: '1920x1080',
    aspect: '16:9',
    quality: 'balanced',
    framing: 'fit',
    description: 'Standard HD landscape video',
  }),
];

module.exports = {
  createProject,
  createSourceMedia,
  createTimelineClip,
  createSubtitleBlock,
  createSubtitleStylePreset,
  createAudioTrack,
  createExportPreset,
  createRenderJob,
  DEFAULT_STYLE_PRESETS,
  DEFAULT_EXPORT_PRESETS,
};
