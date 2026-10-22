'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args); // -> { ok, data } | { ok:false, error:{code,message} }
const on = (channel) => (cb) => {
  const h = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

contextBridge.exposeInMainWorld('alien', {
  getState: () => call('state:get'),
  login: (email, password) => call('auth:login', { email, password }),
  register: (email, password, tiktok) => call('auth:register', { email, password, tiktok }),
  logout: () => call('auth:logout'),
  startDemo: () => call('demo:start'),
  catalog: (lang) => call('store:catalog', lang),
  entitlements: () => call('store:entitlements'),
  checkout: (provider, product, slug, lang) => call('store:checkout', { provider, product, slug, lang }),
  billingPortal: (lang) => call('store:portal', lang),
  cancelSubscription: () => call('store:cancel'),
  resumeSubscription: () => call('store:resume'),
  device: () => call('device:get'),
  transferDevice: () => call('device:transfer'),
  installed: () => call('games:installed'),
  running: () => call('games:running'),
  install: (slug) => call('games:install', slug),
  uninstall: (slug) => call('games:uninstall', slug),
  play: (slug) => call('games:play', slug),
  openFolder: (slug) => call('games:openFolder', slug),
  getSettings: () => call('settings:get'),
  setApiUrl: (url) => call('settings:setApiUrl', url),
  restartToUpdate: () => call('update:install'),
  admin: {
    call: (method, path, body) => call('admin:call', { method, path, body }),
    pick: (kind) => call('admin:pick', { kind }),
    fileInfo: (paths) => call('admin:fileInfo', paths),
    pathFor: (file) => { try { return webUtils.getPathForFile(file); } catch (_) { return ''; } },
    upload: (opts) => call('admin:upload', opts),
    firestoreKey: (opts) => call('admin:firestoreKey', opts),
    onProgress: on('admin:progress')
  },
  onProgress: on('games:progress'),
  onGameState: on('games:state'),
  onAccessChanged: on('access:changed'),
  onAccessRevoked: on('access:revoked'),
  onUpdate: on('update:status')
});
