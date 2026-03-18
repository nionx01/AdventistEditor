// forge.config.js — Electron Forge configuration for AdventistEditor
module.exports = {
  packagerConfig: {
    name: 'AdventistEditor',
    executableName: 'AdventistEditor',
    asar: true,
    icon: './src/assets/AdventistEditorLogo', // .ico on Windows, .icns on macOS
    appBundleId: 'com.adventisteditor.app',
    appCopyright: 'Copyright 2026 AdventistEditor',
    win32metadata: {
      CompanyName: 'AdventistEditor',
      FileDescription: 'Edit Long Videos Into Social-Ready Content',
      ProductName: 'AdventistEditor',
    },
    // Ensure ffmpeg-static and ffprobe-static binaries are not excluded from asar
    ignore: [
      /^\/\.git/,
      /^\/out/,
    ],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'AdventistEditor',
        setupIcon: './src/assets/AdventistEditorLogo.ico',
        // Title shown in the Windows installer
        setupExe: 'AdventistEditorSetup.exe',
        // Shown in Add/Remove Programs
        description: 'Edit Long Videos Into Social-Ready Content',
        authors: 'nionx01',
        // NuGet package ID — must match the app name exactly
        nugetVersion: '0.0.1',
      },
    },
    {
      // Zip archive for macOS and Linux
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux'],
    },
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'nionx01',
          name: 'AdventistEditor',
        },
        // Creates a draft release — review on GitHub then publish manually
        prerelease: false,
        draft: true,
        // Tag format must match the version in package.json
        tagPrefix: 'v',
      },
    },
  ],
};
