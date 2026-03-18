/**
 * AdventistEditor — ExportService
 *
 * Orchestrates multi-step render jobs:
 *   1. Trim and concat timeline clips
 *   2. Apply framing / resolution transforms
 *   3. Burn subtitles if requested
 *   4. Export MP4 or GIF to user-chosen output path
 *
 * This service takes a RenderJob object (defined in data/models.js)
 * and delegates low-level operations to FFmpegService.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

class ExportService {
  /**
   * @param {FFmpegService} ffmpegService - Injected FFmpeg service
   */
  constructor(ffmpegService) {
    this.ffmpeg = ffmpegService;
    this.tempDir = path.join(os.tmpdir(), 'AdventistEditor_export');
    this._ensureTempDir();
  }

  _ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  // -------------------------------------------------------------------------
  // Main Render — MP4
  // -------------------------------------------------------------------------
  async render(renderJob, onProgress) {
    const { clips, subtitles, stylePresets, resolution, quality, framing, burnSubtitles } = renderJob;

    this._reportProgress(onProgress, 0, 'Starting render...');

    if (!renderJob.outputPath) {
      throw new Error('No output path specified in render job');
    }

    const outputPath = renderJob.outputPath;

    // Step 1: Trim each clip to a temp file
    this._reportProgress(onProgress, 5, 'Trimming clips...');
    const trimmedPaths = await this._trimClips(clips, onProgress, 5, 40);

    // Step 2: Concat all trimmed clips
    this._reportProgress(onProgress, 40, 'Joining clips...');
    const concatPath = path.join(this.tempDir, `concat_${Date.now()}.mp4`);

    let workingPath;
    if (trimmedPaths.length === 1) {
      workingPath = trimmedPaths[0];
    } else {
      await this.ffmpeg.concat(trimmedPaths, concatPath, (p) =>
        this._reportProgress(onProgress, 40 + (p.percent || 0) * 0.15, p.message)
      );
      workingPath = concatPath;
    }

    // Step 3: Export to target resolution/framing
    this._reportProgress(onProgress, 55, 'Applying framing...');
    const framedPath = path.join(this.tempDir, `framed_${Date.now()}.mp4`);

    await this.ffmpeg.exportMp4(workingPath, framedPath, { resolution, quality, framing }, (p) =>
      this._reportProgress(onProgress, 55 + (p.percent || 0) * 0.25, p.message)
    );

    workingPath = framedPath;

    // Step 4: Burn subtitles (optional)
    if (burnSubtitles && subtitles && subtitles.length > 0) {
      this._reportProgress(onProgress, 80, 'Burning subtitles...');
      const srtPath = await this._writeSRT(subtitles, renderJob.id);
      const subbedPath = path.join(this.tempDir, `subbed_${Date.now()}.mp4`);
      const stylePreset = (stylePresets || [])[0] || {};

      await this.ffmpeg.burnSubtitles(workingPath, srtPath, subbedPath, stylePreset, (p) =>
        this._reportProgress(onProgress, 80 + (p.percent || 0) * 0.15, p.message)
      );

      workingPath = subbedPath;
      try { fs.unlinkSync(srtPath); } catch {}
    }

    // Step 5: Move final output to target path
    this._reportProgress(onProgress, 95, 'Finalising...');
    fs.copyFileSync(workingPath, outputPath);

    // Cleanup temp files
    this._cleanTempFiles(trimmedPaths, concatPath, framedPath);

    this._reportProgress(onProgress, 100, 'Done!');
    return { success: true, outputPath };
  }

  // -------------------------------------------------------------------------
  // GIF Export
  // -------------------------------------------------------------------------
  async exportGif(options, onProgress) {
    const { clips, fps, scale, outputPath } = options;

    if (!outputPath) throw new Error('No output path specified');
    if (!clips || clips.length === 0) throw new Error('No clips to export');

    this._reportProgress(onProgress, 0, 'Preparing GIF export...');

    // For GIF we use the first clip's source (or the concat of all clips)
    const trimmedPaths = await this._trimClips(clips, onProgress, 0, 50);

    let workingPath = trimmedPaths[0];
    if (trimmedPaths.length > 1) {
      const concatPath = path.join(this.tempDir, `gif_concat_${Date.now()}.mp4`);
      await this.ffmpeg.concat(trimmedPaths, concatPath);
      workingPath = concatPath;
    }

    this._reportProgress(onProgress, 50, 'Rendering GIF...');

    await this.ffmpeg.exportGif(workingPath, outputPath, { fps, scale }, (p) =>
      this._reportProgress(onProgress, 50 + (p.percent || 0) * 0.5, p.message)
    );

    this._cleanTempFiles(trimmedPaths);
    this._reportProgress(onProgress, 100, 'GIF export done!');
    return { success: true, outputPath };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Trim each timeline clip to a separate temp MP4 file.
   */
  async _trimClips(clips, onProgress, progressStart, progressEnd) {
    const results = [];
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const outPath = path.join(this.tempDir, `clip_${Date.now()}_${i}.mp4`);
      const duration = clip.endTime - clip.startTime;

      const progressOffset = progressStart + ((progressEnd - progressStart) * i / clips.length);

      await this.ffmpeg.trim(
        clip.sourcePath,
        outPath,
        clip.startTime,
        duration,
        (p) => this._reportProgress(onProgress, progressOffset + (p.percent || 0) * ((progressEnd - progressStart) / clips.length / 100), p.message)
      );

      results.push(outPath);
    }
    return results;
  }

  /**
   * Write subtitle blocks to a .srt file.
   */
  async _writeSRT(subtitles, jobId) {
    const srtPath = path.join(this.tempDir, `subs_${jobId || Date.now()}.srt`);
    const lines = [];

    subtitles
      .slice()
      .sort((a, b) => a.startTime - b.startTime)
      .forEach((sub, i) => {
        lines.push(String(i + 1));
        lines.push(`${this._toSRTTime(sub.startTime)} --> ${this._toSRTTime(sub.endTime)}`);
        lines.push(sub.text || '');
        lines.push('');
      });

    fs.writeFileSync(srtPath, lines.join('\n'), 'utf8');
    return srtPath;
  }

  /**
   * Convert seconds to SRT timestamp format: HH:MM:SS,mmm
   */
  _toSRTTime(seconds) {
    const ms = Math.round((seconds % 1) * 1000);
    const s = Math.floor(seconds % 60);
    const m = Math.floor((seconds / 60) % 60);
    const h = Math.floor(seconds / 3600);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }

  _reportProgress(onProgress, percent, message) {
    if (typeof onProgress === 'function') {
      onProgress({ percent: Math.round(percent), message });
    }
  }

  _cleanTempFiles(...filePaths) {
    for (const p of filePaths.flat()) {
      try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch {}
    }
  }
}

module.exports = ExportService;
