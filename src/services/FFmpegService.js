/**
 * AdventistEditor — FFmpegService
 *
 * This service wraps all FFmpeg operations used by the app.
 * It keeps FFmpeg logic fully separated from IPC and UI code.
 *
 * Architecture:
 *   - Each method builds a clean FFmpeg command
 *   - Commands are executed via fluent-ffmpeg or child_process
 *   - Progress callbacks are supported where appropriate
 *   - Error handling is standardised
 *
 * NOTE: This service targets ffmpeg available on PATH by default.
 * Set ffmpegPath in constructor to override (e.g. a bundled binary).
 */

'use strict';

const path = require('path');
const fs = require('fs');

// We use fluent-ffmpeg as a clean command builder
let ffmpeg;
try {
  ffmpeg = require('fluent-ffmpeg');
} catch {
  ffmpeg = null; // Graceful fallback — service works in demo mode
}

class FFmpegService {
  constructor(options = {}) {
    this.ffmpegPath = options.ffmpegPath || null; // Override binary path
    this.ffprobePath = options.ffprobePath || null;

    if (this.ffmpegPath && ffmpeg) ffmpeg.setFfmpegPath(this.ffmpegPath);
    if (this.ffprobePath && ffmpeg) ffmpeg.setFfprobePath(this.ffprobePath);
  }

  // -------------------------------------------------------------------------
  // Availability Check
  // -------------------------------------------------------------------------
  async checkAvailability() {
    if (!ffmpeg) {
      return { available: false, reason: 'fluent-ffmpeg not installed' };
    }
    return new Promise((resolve) => {
      ffmpeg.getAvailableFormats((err) => {
        if (err) {
          resolve({ available: false, reason: err.message });
        } else {
          resolve({ available: true });
        }
      });
    });
  }

  // -------------------------------------------------------------------------
  // Probe — get media metadata
  // -------------------------------------------------------------------------
  async probe(filePath) {
    if (!ffmpeg) return this._mockProbe(filePath);

    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) return reject(new Error(`FFprobe error: ${err.message}`));
        resolve(metadata);
      });
    });
  }

  _mockProbe(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const isVideo = ['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext);
    return {
      format: {
        filename: filePath,
        duration: 120,
        size: 50000000,
        bit_rate: 3000000,
      },
      streams: isVideo
        ? [
            { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, r_frame_rate: '30/1' },
            { codec_type: 'audio', codec_name: 'aac' },
          ]
        : [{ codec_type: 'audio', codec_name: 'aac' }],
    };
  }

  // -------------------------------------------------------------------------
  // Trim — cut a section of a video
  // Input:  inputPath, outputPath, startTime (seconds), duration (seconds)
  // -------------------------------------------------------------------------
  async trim(inputPath, outputPath, startTime, duration, onProgress) {
    this._ensureOutputDir(outputPath);
    if (!ffmpeg) return this._mockExec('trim', outputPath, onProgress);

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .outputOptions(['-c:v libx264', '-c:a aac', '-avoid_negative_ts make_zero'])
        .output(outputPath)
        .on('progress', (p) => onProgress && onProgress({ percent: p.percent, message: `Trimming ${Math.round(p.percent || 0)}%` }))
        .on('end', () => resolve({ success: true, outputPath }))
        .on('error', (err) => reject(new Error(`Trim failed: ${err.message}`)))
        .run();
    });
  }

  // -------------------------------------------------------------------------
  // Split — write two output files by splitting at a given time
  // -------------------------------------------------------------------------
  async split(inputPath, outputDir, splitTime, onProgress) {
    this._ensureOutputDir(outputDir);
    const ext = path.extname(inputPath);
    const base = path.basename(inputPath, ext);
    const outA = path.join(outputDir, `${base}_A${ext}`);
    const outB = path.join(outputDir, `${base}_B${ext}`);

    if (!ffmpeg) return this._mockExec('split', { outA, outB }, onProgress);

    // Split into part A (from start to splitTime)
    await this.trim(inputPath, outA, 0, splitTime, onProgress);

    // Part B: we need to know total duration
    const meta = await this.probe(inputPath);
    const totalDuration = meta.format.duration;
    await this.trim(inputPath, outB, splitTime, totalDuration - splitTime, onProgress);

    return { success: true, outA, outB };
  }

  // -------------------------------------------------------------------------
  // Concat — join multiple clips into one output file
  // Inputs: array of file paths, outputPath
  // -------------------------------------------------------------------------
  async concat(inputPaths, outputPath, onProgress) {
    this._ensureOutputDir(outputPath);
    if (!ffmpeg) return this._mockExec('concat', outputPath, onProgress);
    if (inputPaths.length === 0) throw new Error('No inputs provided to concat');

    // Write a temporary concat list file
    const listPath = outputPath + '.concat_list.txt';
    const listContent = inputPaths.map(p => `file '${p.replace(/'/g, "\\'")}'`).join('\n');
    fs.writeFileSync(listPath, listContent, 'utf8');

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions(['-c copy'])
        .output(outputPath)
        .on('progress', (p) => onProgress && onProgress({ percent: p.percent, message: `Concatenating ${Math.round(p.percent || 0)}%` }))
        .on('end', () => {
          fs.unlinkSync(listPath); // Clean up temp file
          resolve({ success: true, outputPath });
        })
        .on('error', (err) => {
          try { fs.unlinkSync(listPath); } catch {}
          reject(new Error(`Concat failed: ${err.message}`));
        })
        .run();
    });
  }

  // -------------------------------------------------------------------------
  // Crop — crop video to specified width/height/x/y
  // -------------------------------------------------------------------------
  async crop(inputPath, outputPath, { width, height, x = 0, y = 0 }, onProgress) {
    this._ensureOutputDir(outputPath);
    if (!ffmpeg) return this._mockExec('crop', outputPath, onProgress);

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoFilters(`crop=${width}:${height}:${x}:${y}`)
        .outputOptions(['-c:a copy'])
        .output(outputPath)
        .on('progress', (p) => onProgress && onProgress({ percent: p.percent, message: `Cropping ${Math.round(p.percent || 0)}%` }))
        .on('end', () => resolve({ success: true, outputPath }))
        .on('error', (err) => reject(new Error(`Crop failed: ${err.message}`)))
        .run();
    });
  }

  // -------------------------------------------------------------------------
  // Scale — resize video
  // -------------------------------------------------------------------------
  async scale(inputPath, outputPath, width, height, onProgress) {
    this._ensureOutputDir(outputPath);
    if (!ffmpeg) return this._mockExec('scale', outputPath, onProgress);

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoFilters(`scale=${width}:${height}`)
        .outputOptions(['-c:a copy'])
        .output(outputPath)
        .on('progress', (p) => onProgress && onProgress({ percent: p.percent, message: `Scaling ${Math.round(p.percent || 0)}%` }))
        .on('end', () => resolve({ success: true, outputPath }))
        .on('error', (err) => reject(new Error(`Scale failed: ${err.message}`)))
        .run();
    });
  }

  // -------------------------------------------------------------------------
  // Pad — add padding / letterbox / pillarbox
  // -------------------------------------------------------------------------
  async pad(inputPath, outputPath, { width, height, x = 0, y = 0, color = 'black' }, onProgress) {
    this._ensureOutputDir(outputPath);
    if (!ffmpeg) return this._mockExec('pad', outputPath, onProgress);

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoFilters(`pad=${width}:${height}:${x}:${y}:${color}`)
        .outputOptions(['-c:a copy'])
        .output(outputPath)
        .on('progress', (p) => onProgress && onProgress({ percent: p.percent, message: `Padding ${Math.round(p.percent || 0)}%` }))
        .on('end', () => resolve({ success: true, outputPath }))
        .on('error', (err) => reject(new Error(`Pad failed: ${err.message}`)))
        .run();
    });
  }

  // -------------------------------------------------------------------------
  // Burn Subtitles — render .srt subtitle file onto video
  // -------------------------------------------------------------------------
  async burnSubtitles(inputPath, srtPath, outputPath, styleOptions = {}, onProgress) {
    this._ensureOutputDir(outputPath);
    if (!ffmpeg) return this._mockExec('burnSubtitles', outputPath, onProgress);

    // Build subtitle filter string
    const fontName = styleOptions.fontFamily || 'Arial';
    const fontSize = styleOptions.fontSize || 42;
    const primaryColor = this._colorToASS(styleOptions.textColor || '#ffffff');
    const outlineColor = this._colorToASS(styleOptions.outlineColor || '#000000');
    const borderStyle = styleOptions.backgroundBox ? 3 : 1;
    const outline = styleOptions.outlineThickness || 2;

    // Escape srt path for filter
    const safeSrtPath = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');

    const subsFilter = `subtitles=${safeSrtPath}:force_style='` +
      `FontName=${fontName},FontSize=${fontSize},PrimaryColour=${primaryColor},` +
      `OutlineColour=${outlineColor},BorderStyle=${borderStyle},Outline=${outline},` +
      `Alignment=2,MarginV=40'`;

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoFilters(subsFilter)
        .outputOptions(['-c:v libx264', '-crf 18', '-c:a copy'])
        .output(outputPath)
        .on('progress', (p) => onProgress && onProgress({ percent: p.percent, message: `Burning subtitles ${Math.round(p.percent || 0)}%` }))
        .on('end', () => resolve({ success: true, outputPath }))
        .on('error', (err) => reject(new Error(`Burn subtitles failed: ${err.message}`)))
        .run();
    });
  }

  // -------------------------------------------------------------------------
  // Extract Audio — pull audio track out of video
  // -------------------------------------------------------------------------
  async extractAudio(inputPath, outputPath, onProgress) {
    this._ensureOutputDir(outputPath);
    if (!ffmpeg) return this._mockExec('extractAudio', outputPath, onProgress);

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions(['-vn', '-c:a aac', '-b:a 192k'])
        .output(outputPath)
        .on('progress', (p) => onProgress && onProgress({ percent: p.percent, message: `Extracting audio ${Math.round(p.percent || 0)}%` }))
        .on('end', () => resolve({ success: true, outputPath }))
        .on('error', (err) => reject(new Error(`Extract audio failed: ${err.message}`)))
        .run();
    });
  }

  // -------------------------------------------------------------------------
  // Mute — remove audio track from video
  // -------------------------------------------------------------------------
  async muteAudio(inputPath, outputPath, onProgress) {
    this._ensureOutputDir(outputPath);
    if (!ffmpeg) return this._mockExec('muteAudio', outputPath, onProgress);

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions(['-an', '-c:v copy'])
        .output(outputPath)
        .on('progress', (p) => onProgress && onProgress({ percent: p.percent, message: `Muting audio ${Math.round(p.percent || 0)}%` }))
        .on('end', () => resolve({ success: true, outputPath }))
        .on('error', (err) => reject(new Error(`Mute audio failed: ${err.message}`)))
        .run();
    });
  }

  // -------------------------------------------------------------------------
  // Replace Audio — swap audio track
  // -------------------------------------------------------------------------
  async replaceAudio(videoPath, audioPath, outputPath, onProgress) {
    this._ensureOutputDir(outputPath);
    if (!ffmpeg) return this._mockExec('replaceAudio', outputPath, onProgress);

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .input(audioPath)
        .outputOptions(['-map 0:v', '-map 1:a', '-c:v copy', '-c:a aac', '-shortest'])
        .output(outputPath)
        .on('progress', (p) => onProgress && onProgress({ percent: p.percent, message: `Replacing audio ${Math.round(p.percent || 0)}%` }))
        .on('end', () => resolve({ success: true, outputPath }))
        .on('error', (err) => reject(new Error(`Replace audio failed: ${err.message}`)))
        .run();
    });
  }

  // -------------------------------------------------------------------------
  // Mix Background Music — blend music under original audio
  // -------------------------------------------------------------------------
  async mixBackgroundMusic(videoPath, musicPath, outputPath, { musicVolume = 0.3, videoVolume = 1.0 } = {}, onProgress) {
    this._ensureOutputDir(outputPath);
    if (!ffmpeg) return this._mockExec('mixBgMusic', outputPath, onProgress);

    const audioFilter = `[0:a]volume=${videoVolume}[va];[1:a]volume=${musicVolume}[ma];[va][ma]amix=inputs=2:duration=first[outa]`;

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .input(musicPath)
        .complexFilter(audioFilter)
        .outputOptions(['-map 0:v', '-map [outa]', '-c:v copy', '-c:a aac', '-shortest'])
        .output(outputPath)
        .on('progress', (p) => onProgress && onProgress({ percent: p.percent, message: `Mixing audio ${Math.round(p.percent || 0)}%` }))
        .on('end', () => resolve({ success: true, outputPath }))
        .on('error', (err) => reject(new Error(`Mix bg music failed: ${err.message}`)))
        .run();
    });
  }

  // -------------------------------------------------------------------------
  // Export MP4 — final render with quality settings
  // -------------------------------------------------------------------------
  async exportMp4(inputPath, outputPath, { resolution, quality, framing } = {}, onProgress) {
    this._ensureOutputDir(outputPath);
    if (!ffmpeg) return this._mockExec('exportMp4', outputPath, onProgress);

    const [outWidth, outHeight] = (resolution || '1920x1080').split('x').map(Number);
    const crfMap = { high: 18, balanced: 23, fast: 28 };
    const crf = crfMap[quality] || 23;

    // Build video filter chain for framing
    let vf;
    switch (framing) {
      case 'crop':
        // Crop to fill: scale to fill then crop center
        vf = `scale=${outWidth}:${outHeight}:force_original_aspect_ratio=increase,crop=${outWidth}:${outHeight}`;
        break;
      case 'blur-fill':
        // Blurred background: overlay original on blurred scaled background
        vf = `[0:v]scale=${outWidth}:${outHeight}:force_original_aspect_ratio=increase,crop=${outWidth}:${outHeight},boxblur=20[bg];` +
             `[0:v]scale=${outWidth}:${outHeight}:force_original_aspect_ratio=decrease[fg];` +
             `[bg][fg]overlay=(W-w)/2:(H-h)/2`;
        break;
      case 'fit':
      default:
        // Fit with black letterbox/pillarbox
        vf = `scale=${outWidth}:${outHeight}:force_original_aspect_ratio=decrease,` +
             `pad=${outWidth}:${outHeight}:(ow-iw)/2:(oh-ih)/2:black`;
    }

    return new Promise((resolve, reject) => {
      const cmd = ffmpeg(inputPath)
        .outputOptions([`-vf ${vf}`, `-c:v libx264`, `-crf ${crf}`, `-preset medium`, `-c:a aac`, `-b:a 192k`])
        .output(outputPath);

      cmd
        .on('progress', (p) => onProgress && onProgress({ percent: p.percent, message: `Exporting MP4 ${Math.round(p.percent || 0)}%` }))
        .on('end', () => resolve({ success: true, outputPath }))
        .on('error', (err) => reject(new Error(`MP4 export failed: ${err.message}`)))
        .run();
    });
  }

  // -------------------------------------------------------------------------
  // Export GIF — generate animated GIF from video section
  // -------------------------------------------------------------------------
  async exportGif(inputPath, outputPath, { fps = 15, scale = 480, startTime, duration } = {}, onProgress) {
    this._ensureOutputDir(outputPath);
    if (!ffmpeg) return this._mockExec('exportGif', outputPath, onProgress);

    // Two-pass GIF: generate palette first for high quality
    const palettePath = outputPath + '_palette.png';
    const paletteFilter = `fps=${fps},scale=${scale}:-1:flags=lanczos,palettegen`;
    const gifFilter = `fps=${fps},scale=${scale}:-1:flags=lanczos[x];[x][1:v]paletteuse`;

    try {
      // Pass 1: generate palette
      await new Promise((resolve, reject) => {
        const cmd = ffmpeg(inputPath);
        if (startTime) cmd.setStartTime(startTime);
        if (duration) cmd.setDuration(duration);
        cmd
          .videoFilters(paletteFilter)
          .output(palettePath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });

      // Pass 2: render GIF using palette
      return new Promise((resolve, reject) => {
        const cmd = ffmpeg(inputPath);
        if (startTime) cmd.setStartTime(startTime);
        if (duration) cmd.setDuration(duration);
        cmd
          .input(palettePath)
          .complexFilter(gifFilter)
          .output(outputPath)
          .on('progress', (p) => onProgress && onProgress({ percent: p.percent, message: `Exporting GIF ${Math.round(p.percent || 0)}%` }))
          .on('end', () => {
            try { fs.unlinkSync(palettePath); } catch {}
            resolve({ success: true, outputPath });
          })
          .on('error', (err) => {
            try { fs.unlinkSync(palettePath); } catch {}
            reject(new Error(`GIF export failed: ${err.message}`));
          })
          .run();
      });
    } catch (err) {
      throw new Error(`GIF export failed: ${err.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Generate Thumbnail
  // -------------------------------------------------------------------------
  async generateThumbnail(inputPath, outputPath, time = 1) {
    if (!ffmpeg) {
      return { success: false, reason: 'demo-mode' };
    }
    this._ensureOutputDir(outputPath);

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .screenshots({
          timestamps: [time],
          filename: path.basename(outputPath),
          folder: path.dirname(outputPath),
          size: '320x180',
        })
        .on('end', () => resolve({ success: true, outputPath }))
        .on('error', (err) => reject(new Error(`Thumbnail failed: ${err.message}`)));
    });
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------
  _ensureOutputDir(outputPath) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Convert hex color to ASS format (&H00BBGGRR)
   */
  _colorToASS(hex) {
    const clean = hex.replace('#', '');
    const r = clean.substring(0, 2);
    const g = clean.substring(2, 4);
    const b = clean.substring(4, 6);
    return `&H00${b}${g}${r}`;
  }

  /**
   * Demo-mode mock execution — resolves immediately with fake progress
   */
  _mockExec(operation, outputPath, onProgress) {
    return new Promise((resolve) => {
      let progress = 0;
      const interval = setInterval(() => {
        progress += 20;
        if (onProgress) onProgress({ percent: progress, message: `[Demo] ${operation} ${progress}%` });
        if (progress >= 100) {
          clearInterval(interval);
          resolve({ success: true, outputPath, demo: true });
        }
      }, 100);
    });
  }
}

module.exports = FFmpegService;
