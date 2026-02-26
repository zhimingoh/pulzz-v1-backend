const fs = require('node:fs/promises');
const path = require('node:path');
const { getStateFilePath } = require('./paths');

const DEFAULT_STATE = {
  currentVersion: '',
  versions: [],
  history: []
};

function normalizeState(raw) {
  return {
    currentVersion: typeof raw?.currentVersion === 'string' ? raw.currentVersion : '',
    versions: Array.isArray(raw?.versions) ? raw.versions : [],
    history: Array.isArray(raw?.history) ? raw.history : []
  };
}

async function ensureStateFile() {
  const statePath = getStateFilePath();
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  try {
    await fs.access(statePath);
  } catch {
    await atomicWriteState(DEFAULT_STATE);
  }
}

async function readState() {
  await ensureStateFile();
  const statePath = getStateFilePath();
  const text = await fs.readFile(statePath, 'utf8');
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = DEFAULT_STATE;
  }
  return normalizeState(json);
}

async function atomicWriteState(state) {
  const statePath = getStateFilePath();
  const tempPath = `${statePath}.tmp`;
  const normalized = normalizeState(state);
  const content = `${JSON.stringify(normalized, null, 2)}\n`;
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(tempPath, content, 'utf8');
  await fs.rename(tempPath, statePath);
}

function upsertVersion(versions, version) {
  const now = new Date().toISOString();
  const existing = versions.find((v) => v.version === version);
  if (existing) {
    existing.uploadedAt = now;
    return { versions, overwrite: true };
  }

  return {
    versions: [...versions, { version, uploadedAt: now }],
    overwrite: false
  };
}

async function recordUpload(version) {
  const state = await readState();
  const result = upsertVersion(state.versions, version);
  const history = [
    ...state.history,
    {
      action: result.overwrite ? 'upload_overwrite' : 'upload',
      version,
      at: new Date().toISOString()
    }
  ];

  const nextState = {
    ...state,
    versions: result.versions,
    history
  };

  await atomicWriteState(nextState);
  return result.overwrite;
}

async function setCurrentVersion(version, action) {
  const state = await readState();
  const nextVersions = state.versions.some((v) => v.version === version)
    ? state.versions.map((v) => (v.version === version ? { ...v, publishedAt: new Date().toISOString() } : v))
    : [...state.versions, { version, uploadedAt: new Date().toISOString(), publishedAt: new Date().toISOString() }];

  const nextState = {
    currentVersion: version,
    versions: nextVersions,
    history: [
      ...state.history,
      {
        action,
        version,
        at: new Date().toISOString()
      }
    ]
  };

  await atomicWriteState(nextState);
}

module.exports = {
  DEFAULT_STATE,
  normalizeState,
  ensureStateFile,
  readState,
  atomicWriteState,
  recordUpload,
  setCurrentVersion
};
