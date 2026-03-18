/**
 * AdventistEditor — Demo Project
 *
 * A hard-coded demo project for testing the UI without needing real media.
 * Useful during development and for screenshots / portfolio demos.
 *
 * Load via: require('./demoProject')
 */

'use strict';

const { DEFAULT_STYLE_PRESETS, DEFAULT_EXPORT_PRESETS } = require('./models');

const demoProject = {
  id: 'demo-001',
  name: 'Demo: Sunday Sermon Highlights',
  version: '1.0',
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T12:30:00.000Z',

  settings: {
    defaultMode: 'advanced',
    exportFolder: '',
    ffmpegPath: '',
  },

  mediaItems: [
    {
      id: 'media-001',
      filePath: '/demo/sermon_full.mp4',
      fileName: 'sermon_full.mp4',
      type: 'video',
      fileSize: 1_800_000_000, // ~1.8 GB
      duration: 3600,           // 60 minutes
      resolution: '1920x1080',
      width: 1920,
      height: 1080,
      frameRate: 29.97,
      bitrate: 4_000_000,
      hasAudio: true,
      hasVideo: true,
      codec: 'h264',
      thumbnailPath: null,
      importedAt: '2026-01-15T10:00:00.000Z',
    },
    {
      id: 'media-002',
      filePath: '/demo/background_music.mp3',
      fileName: 'background_music.mp3',
      type: 'audio',
      fileSize: 8_000_000,
      duration: 240,
      resolution: null,
      width: null,
      height: null,
      frameRate: null,
      bitrate: 256_000,
      hasAudio: true,
      hasVideo: false,
      codec: 'mp3',
      thumbnailPath: null,
      importedAt: '2026-01-15T10:05:00.000Z',
    },
  ],

  clips: [
    {
      id: 'clip-001',
      sourceMediaId: 'media-001',
      sourcePath: '/demo/sermon_full.mp4',
      startTime: 120,    // 2:00
      endTime: 145,      // 2:25
      trackIndex: 0,
      position: 0,
      label: 'Opening Moment',
      color: '#2563eb',
      muted: false,
    },
    {
      id: 'clip-002',
      sourceMediaId: 'media-001',
      sourcePath: '/demo/sermon_full.mp4',
      startTime: 840,    // 14:00
      endTime: 880,      // 14:40
      trackIndex: 0,
      position: 25,
      label: 'Key Message',
      color: '#7c3aed',
      muted: false,
    },
    {
      id: 'clip-003',
      sourceMediaId: 'media-001',
      sourcePath: '/demo/sermon_full.mp4',
      startTime: 3540,   // 59:00
      endTime: 3570,     // 59:30
      trackIndex: 0,
      position: 65,
      label: 'Closing Call',
      color: '#059669',
      muted: false,
    },
  ],

  subtitles: [
    {
      id: 'sub-001',
      startTime: 0,
      endTime: 3,
      text: 'There is power in community.',
      stylePresetId: 0,
      displayMode: 'full-line',
      alignment: 'center',
      position: 'bottom',
      emphasis: { enabled: false, wordIndex: 0 },
    },
    {
      id: 'sub-002',
      startTime: 4,
      endTime: 7.5,
      text: 'Every day is a new opportunity.',
      stylePresetId: 1,
      displayMode: 'chunk',
      alignment: 'center',
      position: 'bottom',
      emphasis: { enabled: false, wordIndex: 0 },
    },
    {
      id: 'sub-003',
      startTime: 8,
      endTime: 12,
      text: 'Walk boldly in your purpose.',
      stylePresetId: 0,
      displayMode: 'full-line',
      alignment: 'center',
      position: 'bottom',
      emphasis: { enabled: false, wordIndex: 0 },
    },
  ],

  stylePresets: DEFAULT_STYLE_PRESETS,
  exportPresets: DEFAULT_EXPORT_PRESETS,

  audioTracks: [
    {
      id: 'audio-001',
      filePath: '/demo/background_music.mp3',
      fileName: 'background_music.mp3',
      type: 'background',
      volume: 0.25,
      muted: false,
      startTime: 0,
      duration: null,
      fadeIn: 2,
      fadeOut: 3,
    },
  ],

  renderJobs: [],
};

module.exports = demoProject;
