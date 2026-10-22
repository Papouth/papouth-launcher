'use strict';
const path = require('path');
const os = require('os');

const DEFAULT_STORE_API_URL = 'https://papouth.dupas.pro/api/store';

const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');

module.exports = {
  DEFAULT_STORE_API_URL,
  // Priorité : réglage utilisateur (settings.json) > variable d'environnement > défaut
  envApiUrl: () => process.env.STORE_API_URL || null,
  GAMES_DIR: path.join(localAppData, 'Papouth', 'Games'),
  LEGACY_GAMES_DIR: path.join(localAppData, 'AlienLive', 'Games'),
  MANIFEST_FILE: path.join(localAppData, 'Papouth', 'Games', 'installed.json'),
  GITHUB: { owner: 'Papouth', repo: 'papouth-launcher' },
  DEMO: process.env.ALIEN_DEMO === '1' || process.env.PAPOUTH_DEMO_ADMIN === '1',
  DEMO_ADMIN: process.env.PAPOUTH_DEMO_ADMIN === '1', // le compte démo devient administrateur (faux backend en mémoire)
  POLL_INTERVAL_MS: 3000,
  POLL_TIMEOUT_MS: 10 * 60 * 1000
};
