/**
 * AdventistEditor — WhisperService
 *
 * Handles AI subtitle generation using OpenAI Whisper (local, open-source).
 *
 * Pipeline:
 *   1. Extract 16 kHz mono WAV from video (via FFmpeg)
 *   2. Run Whisper CLI:  python -m whisper audio.wav --model base --output_format srt
 *   3. Read the generated .srt file
 *   4. Parse .srt into subtitle block objects ready for the editor
 *
 * Requirements (user must install):
 *   pip install openai-whisper
 *   FFmpeg on PATH
 */

'use strict';

const { spawn } = require('child_process');
const path      = require('path');
const fs        = require('fs');
const os        = require('os');

class WhisperService {
  constructor(ffmpegService) {
    this.ffmpegService = ffmpegService;
    // Temp folder for intermediate audio/srt files
    this.tempDir = path.join(os.tmpdir(), 'adventist-editor-whisper');
    this._ensureTempDir();
  }

  _ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir, { recursive: true });
  }

  // ---------------------------------------------------------------------------
  // Main entry point — full pipeline
  // ---------------------------------------------------------------------------
  /**
   * Generate subtitles for a video file.
   * @param {string} videoPath   - Source video file
   * @param {string} model       - Whisper model: tiny | base | small | medium | large
   * @param {Function} onProgress - ({ step, percent, message }) callback
   * @returns {Promise<Array>}   - Array of subtitle block objects
   */
  async generateSubtitles(videoPath, model = 'base', onProgress) {
    const baseName  = path.basename(videoPath, path.extname(videoPath)).replace(/\s+/g, '_');
    const wavPath   = path.join(this.tempDir, `${baseName}.wav`);
    const srtPath   = path.join(this.tempDir, `${baseName}.srt`);

    try {
      // Step 1 — Extract audio as 16 kHz mono WAV
      onProgress && onProgress({ step: 1, percent: 5, message: 'Extracting audio for Whisper…' });
      await this.extractAudioForWhisper(videoPath, wavPath);
      onProgress && onProgress({ step: 1, percent: 30, message: 'Audio extracted' });

      // Step 2 — Run Whisper CLI
      onProgress && onProgress({ step: 2, percent: 35, message: `Running Whisper (${model})…` });
      await this.runWhisper(wavPath, this.tempDir, model, onProgress);
      onProgress && onProgress({ step: 2, percent: 90, message: 'Whisper finished' });

      // Step 3 — Read and parse the SRT
      if (!fs.existsSync(srtPath)) {
        throw new Error('Whisper did not produce an SRT file. Check that Whisper is installed.');
      }
      const srtContent = fs.readFileSync(srtPath, 'utf8');
      const subtitles  = this.parseSRT(srtContent);
      onProgress && onProgress({ step: 3, percent: 100, message: `Done — ${subtitles.length} subtitles generated` });

      return subtitles;
    } finally {
      // Clean up temp files (best-effort)
      [wavPath, srtPath].forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {} });
    }
  }

  // ---------------------------------------------------------------------------
  // Step 1 — Extract audio: 16 kHz, mono, PCM WAV (Whisper requirement)
  // ---------------------------------------------------------------------------
  async extractAudioForWhisper(videoPath, wavPath) {
    if (!this.ffmpegService) throw new Error('FFmpegService not available');

    return new Promise((resolve, reject) => {
      // Use child_process directly so we can pass precise flags
      const args = [
        '-y',                         // overwrite
        '-i', videoPath,
        '-vn',                        // no video
        '-ar', '16000',               // 16 kHz sample rate (Whisper spec)
        '-ac', '1',                   // mono channel
        '-f', 'wav',                  // WAV format
        wavPath,
      ];

      const proc = spawn('ffmpeg', args, { windowsHide: true });
      let stderr = '';

      proc.stderr.on('data', d => { stderr += d.toString(); });

      proc.on('close', code => {
        if (code === 0) return resolve(wavPath);
        reject(new Error(`FFmpeg audio extraction failed (code ${code}):\n${stderr.slice(-500)}`));
      });

      proc.on('error', err => {
        reject(new Error(`FFmpeg not found. Make sure FFmpeg is installed and on PATH.\n${err.message}`));
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Step 2 — Run Whisper CLI
  // ---------------------------------------------------------------------------
  /**
   * Tries "python -m whisper" first; falls back to "whisper" bare command.
   */
  async runWhisper(wavPath, outputDir, model, onProgress) {
    return new Promise((resolve, reject) => {
      // Try python -m whisper first (works if installed via pip without adding to PATH)
      const args = [
        '-m', 'whisper',
        wavPath,
        '--model', model,
        '--output_format', 'srt',
        '--output_dir', outputDir,
        '--verbose', 'False',
        '--fp16', 'False',           // Disable fp16 — avoids GPU/CUDA requirement
      ];

      let proc = spawn('python', args, { windowsHide: true });
      let stderr = '';
      let stdout = '';
      let commandFailed = false;

      proc.stdout.on('data', d => {
        stdout += d.toString();
        // Whisper logs progress-like lines to stdout
        const line = d.toString().trim();
        if (line && onProgress) {
          onProgress({ step: 2, percent: null, message: `Whisper: ${line.slice(0, 80)}` });
        }
      });

      proc.stderr.on('data', d => { stderr += d.toString(); });

      proc.on('error', () => {
        // python not found or python -m whisper failed — try bare "whisper" command
        commandFailed = true;
        this._runBareWhisper(wavPath, outputDir, model, onProgress)
          .then(resolve)
          .catch(reject);
      });

      proc.on('close', code => {
        if (commandFailed) return; // handled above
        if (code === 0) return resolve();
        // Check if it's a module-not-found error; try bare whisper command
        if (stderr.includes('No module named') || stderr.includes('ModuleNotFoundError')) {
          this._runBareWhisper(wavPath, outputDir, model, onProgress)
            .then(resolve)
            .catch(reject);
        } else {
          reject(new Error(
            `Whisper failed (code ${code}).\n` +
            `Make sure Whisper is installed: pip install openai-whisper\n` +
            `Error: ${stderr.slice(-400)}`
          ));
        }
      });
    });
  }

  _runBareWhisper(wavPath, outputDir, model, onProgress) {
    return new Promise((resolve, reject) => {
      const args = [
        wavPath,
        '--model', model,
        '--output_format', 'srt',
        '--output_dir', outputDir,
        '--verbose', 'False',
        '--fp16', 'False',
      ];

      const proc = spawn('whisper', args, { windowsHide: true });
      let stderr = '';

      proc.stdout.on('data', d => {
        const line = d.toString().trim();
        if (line && onProgress) onProgress({ step: 2, percent: null, message: `Whisper: ${line.slice(0, 80)}` });
      });

      proc.stderr.on('data', d => { stderr += d.toString(); });

      proc.on('error', () => {
        reject(new Error(
          'Whisper is not installed or not on PATH.\n' +
          'Install it with:  pip install openai-whisper\n' +
          'Then restart AdventistEditor.'
        ));
      });

      proc.on('close', code => {
        if (code === 0) return resolve();
        reject(new Error(`Whisper exited with code ${code}.\n${stderr.slice(-400)}`));
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Step 3 — SRT Parser
  // ---------------------------------------------------------------------------
  /**
   * Parse SRT file content into subtitle block objects.
   *
   * SRT format:
   *   1
   *   00:00:01,000 --> 00:00:03,500
   *   Hello world
   *
   *   2
   *   00:00:04,000 --> 00:00:06,000
   *   How are you?
   */
  parseSRT(srtContent) {
    const subtitles = [];
    // Normalise line endings and split on blank lines between blocks
    const blocks = srtContent
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim()
      .split(/\n\s*\n/);

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 2) continue;

      // First non-empty line is the sequence number (skip it)
      let timeLineIdx = 0;
      // Find the timing line (contains "-->")
      while (timeLineIdx < lines.length && !lines[timeLineIdx].includes('-->')) {
        timeLineIdx++;
      }
      if (timeLineIdx >= lines.length) continue;

      const timeLine = lines[timeLineIdx];
      const match = timeLine.match(
        /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
      );
      if (!match) continue;

      const startTime = this._srtTimeToSeconds(match[1], match[2], match[3], match[4]);
      const endTime   = this._srtTimeToSeconds(match[5], match[6], match[7], match[8]);

      // Everything after the timing line is the subtitle text
      const text = lines.slice(timeLineIdx + 1).join('\n').trim();
      // Strip HTML tags Whisper sometimes outputs (e.g. <i>...</i>)
      const cleanText = text.replace(/<[^>]+>/g, '').trim();

      if (!cleanText) continue;

      subtitles.push({
        id:          this._generateId(),
        startTime,
        endTime,
        text:        cleanText,
        stylePresetId: 0,
        displayMode: 'full-line',
        alignment:   'center',
        position:    'bottom',
      });
    }

    return subtitles;
  }

  // ---------------------------------------------------------------------------
  // Check Whisper availability
  // ---------------------------------------------------------------------------
  async checkAvailability() {
    return new Promise(resolve => {
      const proc = spawn('python', ['-m', 'whisper', '--help'], { windowsHide: true });
      proc.on('close', code => resolve({ available: code === 0, command: 'python -m whisper' }));
      proc.on('error', () => {
        // Try bare command
        const proc2 = spawn('whisper', ['--help'], { windowsHide: true });
        proc2.on('close', code2 => resolve({ available: code2 === 0, command: 'whisper' }));
        proc2.on('error', () => resolve({ available: false, command: null }));
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  _srtTimeToSeconds(h, m, s, ms) {
    return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
  }

  _generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  }
}

module.exports = WhisperService;
