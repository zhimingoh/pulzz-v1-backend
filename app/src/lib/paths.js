const path = require('node:path');

const ROOT = process.env.PULZZ_ROOT || '/opt/pulzz-hotupdate';
const APP_ROOT = process.env.PULZZ_APP_ROOT || path.join(ROOT, 'app');
const CDN_ROOT = process.env.PULZZ_CDN_ROOT || path.join(ROOT, 'cdn');

const CONSTANTS = {
  packageName: 'com.smartdog.bbqgame',
  platform: 'WebGLWxMiniGame',
  channel: 'WxMiniGame',
  assetPackageName: 'DefaultPackage',
  appVersion: '1.0.0'
};

function getStateFilePath() {
  return process.env.PULZZ_STATE_PATH || path.join(APP_ROOT, 'config', 'state.json');
}

function getUploadRoot(platformKey = 'wxmini') {
  return path.join(CDN_ROOT, 'gameres', platformKey);
}

function getPublishBasePath() {
  return path.join(
    CDN_ROOT,
    'hotupdate',
    CONSTANTS.packageName,
    CONSTANTS.platform,
    CONSTANTS.appVersion,
    CONSTANTS.channel,
    CONSTANTS.assetPackageName
  );
}

function getPublishTarget(version) {
  return path.join(getPublishBasePath(), String(version));
}

module.exports = {
  ROOT,
  APP_ROOT,
  CDN_ROOT,
  CONSTANTS,
  getStateFilePath,
  getUploadRoot,
  getPublishBasePath,
  getPublishTarget
};
