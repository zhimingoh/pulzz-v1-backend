const fs = require('node:fs/promises');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withFileLock(lockPath, fn, options = {}) {
  const retries = options.retries ?? 60;
  const retryDelayMs = options.retryDelayMs ?? 100;
  let handle;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      handle = await fs.open(lockPath, 'wx');
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
      await sleep(retryDelayMs);
    }
  }

  if (!handle) {
    const lockError = new Error('lock_timeout');
    lockError.code = 'LOCK_TIMEOUT';
    throw lockError;
  }

  try {
    return await fn();
  } finally {
    await handle.close();
    await fs.rm(lockPath, { force: true });
  }
}

module.exports = {
  withFileLock
};
