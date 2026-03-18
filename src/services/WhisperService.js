/**
 * AdventistEditor — WhisperService
 *
 * Handles AI subtitle generation using OpenAI Whisper (local, open-source).
 *
 * Pipeline:
 *   1. Extract 16 kHz mono WAV from video (via bundled FFmpeg)
 *   2. Run Whisper CLI:  python -m whisper audio.wav --model base --output_format srt
 *   3. Read the generated .srt file
 *   4. Parse .srt into subtitle block objects ready for the editor
 */

'use strict';

const { spawn, exec } = require('child_process');
const path      = require('path');
const fs        = require('fs');
const os        = require('os');

// Build an enriched PATH that includes all common Python install locations on Windows
function buildEnrichedEnv() {
  const localAppData = process.env.LOCALAPPDATA || '';
  const appData      = process.env.APPDATA      || '';

  const extraPaths = [
    'C:\\Windows\\System32',
    'C:\\Windows',
    localAppData + '\\Microsoft\\WindowsApps',           // winget
    appData      + '\\Python\\Python311\\Scripts',
    appData      + '\\Python\\Python312\\Scripts',
    appData      + '\\Python\\Python313\\Scripts',
    appData      + '\\Python\\Python314\\Scripts',
    localAppData + '\\Programs\\Python\\Python311',
    localAppData + '\\Programs\\Python\\Python311\\Scripts',
    localAppData + '\\Programs\\Python\\Python312',
    localAppData + '\\Programs\\Python\\Python312\\Scripts',
    localAppData + '\\Programs\\Python\\Python313',
    localAppData + '\\Programs\\Python\\Python313\\Scripts',
    localAppData + '\\Programs\\Python\\Python314',
    localAppData + '\\Programs\\Python\\Python314\\Scripts',
    'C:\\Python311', 'C:\\Python311\\Scripts',
    'C:\\Python312', 'C:\\Python312\\Scripts',
    'C:\\Python313', 'C:\\Python313\\Scripts',
    'C:\\Python314', 'C:\\Python314\\Scripts',
  ].filter(Boolean).join(';');

  return {
    ...process.env,
    PATH: extraPaths + ';' + (process.env.PATH || ''),
  };
}

class WhisperService {
  constructor(ffmpegService) {
    this.ffmpegService = ffmpegService;
    this.tempDir       = path.join(os.tmpdir(), 'adventist-editor-whisper');
    this._ensureTempDir();

    // Use bundled ffmpeg-static binary if available; fall back to system ffmpeg
    this._ffmpegBin = null;
    try {
      this._ffmpegBin = require('ffmpeg-static');
    } catch {
      this._ffmpegBin = 'ffmpeg'; // system fallback
    }
  }

  _ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir, { recursive: true });
  }

  // ---------------------------------------------------------------------------
  // Check Whisper availability (uses enriched PATH so works in packaged app)
  // ---------------------------------------------------------------------------
  async checkAvailability() {
    const env = buildEnrichedEnv();

    const tryCommand = (cmd, args) => new Promise(resolve => {
      const proc = spawn(cmd, args, { windowsHide: true, env, shell: false });
      let finished = false;
      const done = (code) => {
        if (finished) return;
        finished = true;
        resolve(code === 0);
      };
      proc.on('close', done);
      proc.on('error', () => done(-1));
      // Kill after 8 seconds to avoid hanging
      setTimeout(() => { try { proc.kill(); } catch {} done(-1); }, 8000);
    });

    // Try: py, python, python3 — with "-c import whisper" (most reliable check)
    const launchers = ['py', 'python', 'python3'];
    for (const launcher of launchers) {
      const ok = await tryCommand(launcher, ['-c', 'import whisper; print(whisper.__version__)']);
      if (ok) return { available: true, command: `${launcher} -m whisper` };
    }

    // Also try bare "whisper" command in case it's on PATH
    const bareOk = await tryCommand('whisper', ['--help']);
    if (bareOk) return { available: true, command: 'whisper' };

    return { available: false, command: null };
  }

  // ---------------------------------------------------------------------------
  // Main entry point — full pipeline
  // ---------------------------------------------------------------------------
  async generateSubtitles(videoPath, model = 'base', onProgress) {
    const baseName = path.basename(videoPath, path.extname(videoPath)).replace(/[^a-z0-9_-]/gi, '_');
    const wavPath  = path.join(this.tempDir, `${baseName}_${Date.now()}.wav`);
    const srtPath  = path.join(this.tempDir, `${baseName}_${Date.now()}.srt`);

    try {
      // Step 1 — Extract audio as 16 kHz mono WAV
      onProgress && onProgress({ step: 1, percent: 5,  message: 'Extracting audio…' });
      await this._extractAudio(videoPath, wavPath);
      onProgress && onProgress({ step: 1, percent: 28, message: 'Audio extracted ✓' });

      // Step 2 — Run Whisper CLI
      onProgress && onProgress({ step: 2, percent: 32, message: `Running Whisper (${model})… this may take a while` });
      const actualSrtPath = await this._runWhisper(wavPath, this.tempDir, model, onProgress);
      onProgress && onProgress({ step: 2, percent: 90, message: 'Whisper finished ✓' });

      // Step 3 — Read and parse the SRT
      if (!fs.existsSync(actualSrtPath)) {
        throw new Error(`Whisper did not produce an SRT file at: ${actualSrtPath}`);
      }
      const srtContent = fs.readFileSync(actualSrtPath, 'utf8');
      const subtitles  = this.parseSRT(srtContent);
      onProgress && onProgress({ step: 3, percent: 100, message: `Done — ${subtitles.length} subtitles generated` });

      return subtitles;
    } finally {
      // Clean up temp files
      [wavPath, srtPath].forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {} });
    }
  }

  // ---------------------------------------------------------------------------
  // Step 1 — Extract audio with bundled FFmpeg
  // ---------------------------------------------------------------------------
  _extractAudio(videoPath, wavPath) {
    return new Promise((resolve, reject) => {
      const ffbin = this._ffmpegBin;
      const args  = [
        '-y',
        '-i', videoPath,
        '-vn',
        '-ar', '16000',
        '-ac', '1',
        '-f', 'wav',
        wavPath,
      ];

      const env  = buildEnrichedEnv();
      const proc = spawn(ffbin, args, { windowsHide: true, env });
      let stderr = '';

      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('close', code => {
        if (code === 0) return resolve(wavPath);
        reject(new Error(`Audio extraction failed (code ${code}): ${stderr.slice(-400)}`));
      });
      proc.on('error', err => {
        reject(new Error(`FFmpeg not found (${ffbin}): ${err.message}`));
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Step 2 — Run Whisper CLI (tries py, python, python3, then bare whisper)
  // ---------------------------------------------------------------------------
  async _runWhisper(wavPath, outputDir, model, onProgress) {
    const env = buildEnrichedEnv();

    // Whisper writes the SRT next to the input WAV with .srt extension
    const srtPath = path.join(outputDir, path.basename(wavPath, '.wav') + '.srt');

    const whisperArgs = [
      wavPath,
      '--model',         model,
      '--output_format', 'srt',
      '--output_dir',    outputDir,
      '--verbose',       'False',
      '--fp16',          'False',
    ];

    // Try python launchers
    for (const launcher of ['py', 'python', 'python3']) {
      try {
        await this._spawnWhisper(launcher, ['-m', 'whisper', ...whisperArgs], env, onProgress);
        return srtPath;
      } catch (err) {
        if (err.code === 'ENOENT' || err.message.includes('not found') ||
            err.message.includes('No module named') || err.message.includes('ENOENT')) {
          continue; // try next launcher
        }
        throw err; // real error
      }
    }

    // Fallback: bare "whisper" command
    try {
      await this._spawnWhisper('whisper', whisperArgs, env, onProgress);
      return srtPath;
    } catch {
      throw new Error(
        'Could not run Whisper. Make sure it is installed:\n' +
        '  pip install openai-whisper\n' +
        'Then restart AdventistEditor.'
      );
    }
  }

  _spawnWhisper(cmd, args, env, onProgress) {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, { windowsHide: true, env, shell: false });
      let stderr = '';
      let commandNotFound = false;

      proc.stdout.on('data', d => {
        const line = d.toString().trim();
        if (line && onProgress) {
          onProgress({ step: 2, percent: null, message: line.slice(0, 100) });
        }
      });

      proc.stderr.on('data', d => {
        const chunk = d.toString();
        stderr += chunk;
        const line = chunk.trim();
        if (line && onProgress) {
          // Whisper sometimes prints progress to stderr too
          onProgress({ step: 2, percent: null, message: line.slice(0, 100) });
        }
      });

      proc.on('error', err => {
        commandNotFound = true;
        const e = new Error(err.message);
        e.code = err.code;
        reject(e);
      });

      proc.on('close', code => {
        if (commandNotFound) return;
        if (code === 0) return resolve();
        if (stderr.includes('No module named') || stderr.includes('ModuleNotFoundError')) {
          const e = new Error('No module named whisper');
          e.code = 'ENOENT';
          return reject(e);
        }
        reject(new Error(`Whisper exited ${code}: ${stderr.slice(-300)}`));
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Step 3 — SRT Parser
  // ---------------------------------------------------------------------------
  parseSRT(srtContent) {
    const subtitles = [];
    const blocks    = srtContent
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim()
      .split(/\n\s*\n/);

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 2) continue;

      let timeLineIdx = 0;
      while (timeLineIdx < lines.length && !lines[timeLineIdx].includes('-->')) timeLineIdx++;
      if (timeLineIdx >= lines.length) continue;

      const timeLine = lines[timeLineIdx];
      const match    = timeLine.match(
        /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
      );
      if (!match) continue;

      const startTime = this._srtTimeToSeconds(match[1], match[2], match[3], match[4]);
      const endTime   = this._srtTimeToSeconds(match[5], match[6], match[7], match[8]);
      const text      = lines.slice(timeLineIdx + 1).join('\n').replace(/<[^>]+>/g, '').trim();

      if (!text) continue;

      subtitles.push({
        id: this._generateId(),
        startTime,
        endTime,
        text,
        stylePresetId: 0,
        displayMode:   'full-line',
        alignment:     'center',
        position:      'bottom',
      });
    }
    return subtitles;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  _srtTimeToSeconds(h, m, s, ms) {
    return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
  }

  _generateId() {
    return 'sub_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  }
}

module.exports = WhisperService;
