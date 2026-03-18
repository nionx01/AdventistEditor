// forge.config.js — Electron Forge configuration for AdventistEditor
module.exports = {
  packagerConfig: {
    name: 'AdventistEditor',
    executableName: 'AdventistEditor',
    asar: true,
    icon: './src/assets/AdventistEditorLogo', // .ico used on Windows, .icns on macOS (Electron Forge picks the right one)
    appBundleId: 'com.adventisteditor.app',
    appCopyright: 'Copyright 2026 AdventistEditor',
    win32metadata: {
      CompanyName: 'AdventistEditor',
      FileDescription: 'Edit Long Videos Into Social-Ready Content',
      ProductName: 'AdventistEditor',
    },
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'AdventistEditor',
        setupIcon: './src/assets/AdventistEditorLogo.ico', // Used in Windows installer
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux'],
    },
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'your-github-username',   // TODO: Replace with your GitHub username
          name: 'AdventistEditor',
        },
        prerelease: false,
        draft: true,
      },
    },
  ],
};
