/**
 * AdventistEditor — MediaService
 *
 * Handles reading media file metadata and generating preview thumbnails.
 * Uses FFmpegService.probe() for accurate metadata extraction.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const FFmpegService = require('./FFmpegService');

const ffmpegService = new FFmpegService();

// Supported file extensions
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.m4v'];
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.aac', '.ogg', '.flac', '.m4a', '.wma'];

class MediaService {
  /**
   * Analyse a media file and return a SourceMedia object.
   */
  async getMediaInfo(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const ext = path.extname(filePath).toLowerCase();
    const isVideo = VIDEO_EXTENSIONS.includes(ext);
    const isAudio = AUDIO_EXTENSIONS.includes(ext);

    if (!isVideo && !isAudio) {
      throw new Error(`Unsupported file type: ${ext}`);
    }

    const stat = fs.statSync(filePath);
    const fileName = path.basename(filePath);

    // Attempt to get FFprobe metadata
    let metadata;
    try {
      metadata = await ffmpegService.probe(filePath);
    } catch (err) {
      console.warn('MediaService: probe failed, using fallback', err.message);
      metadata = null;
    }

    const videoStream = metadata?.streams?.find(s => s.codec_type === 'video');
    const audioStream = metadata?.streams?.find(s => s.codec_type === 'audio');

    // Parse frame rate from "30/1" format
    const frameRate = this._parseFrameRate(videoStream?.r_frame_rate);

    return {
      id: this._generateId(),
      filePath,
      fileName,
      type: isVideo ? 'video' : 'audio',
      fileSize: stat.size,
      duration: metadata?.format?.duration || null,
      resolution: videoStream ? `${videoStream.width}x${videoStream.height}` : null,
      width: videoStream?.width || null,
      height: videoStream?.height || null,
      frameRate,
      bitrate: metadata?.format?.bit_rate || null,
      hasAudio: !!audioStream,
      hasVideo: !!videoStream,
      codec: videoStream?.codec_name || audioStream?.codec_name || null,
      importedAt: new Date().toISOString(),
    };
  }

  /**
   * Generate a thumbnail image from a video at a given time (seconds).
   * Writes to a temp file and returns the output path.
   */
  async generateThumbnail(filePath, outputPath, time = 1) {
    const resolvedOutput = outputPath || path.join(
      os.tmpdir(),
      `ae_thumb_${Date.now()}.jpg`
    );

    try {
      await ffmpegService.generateThumbnail(filePath, resolvedOutput, time);
      return resolvedOutput;
    } catch (err) {
      console.warn('Thumbnail generation failed:', err.message);
      return null;
    }
  }

  /**
   * Returns true if the given file extension is supported.
   */
  isSupported(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return VIDEO_EXTENSIONS.includes(ext) || AUDIO_EXTENSIONS.includes(ext);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------
  _parseFrameRate(str) {
    if (!str) return null;
    const parts = str.split('/');
    if (parts.length === 2) {
      const rate = parseFloat(parts[0]) / parseFloat(parts[1]);
      return Math.round(rate * 100) / 100;
    }
    return parseFloat(str) || null;
  }

  _generateId() {
    return 'media_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }
}

module.exports = MediaService;
