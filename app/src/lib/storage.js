const fs = require('node:fs/promises');
const path = require('node:path');
const { getAssetsPrefixRoot, getLegacyHotupdatePrefixRoot } = require('./paths');

function normalizeRelPath(relPath) {
  return relPath.split(path.sep).join('/');
}

async function listFiles(rootDir) {
  const out = [];
  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        out.push(fullPath);
      }
    }
  }
  await walk(rootDir);
  return out;
}

async function syncToCosMock({ platform, version, sourceDir }) {
  const mockRoot = process.env.PULZZ_COS_MOCK_ROOT;
  if (!mockRoot) {
    return;
  }
  const primaryRoot = path.join(mockRoot, getAssetsPrefixRoot(), platform, String(version));
  const legacyRoot = path.join(mockRoot, getLegacyHotupdatePrefixRoot(), String(version));
  for (const targetRoot of [primaryRoot, legacyRoot]) {
    await fs.rm(targetRoot, { recursive: true, force: true });
    await fs.mkdir(path.dirname(targetRoot), { recursive: true });
    await fs.cp(sourceDir, targetRoot, { recursive: true, force: true });
  }
}

async function syncToCosReal({ platform, version, sourceDir }) {
  const secretId = process.env.TENCENT_SECRET_ID || '';
  const secretKey = process.env.TENCENT_SECRET_KEY || '';
  const bucket = process.env.TENCENT_COS_BUCKET || '';
  const region = process.env.TENCENT_COS_REGION || '';
  const prefixRoot = getAssetsPrefixRoot();
  const legacyPrefixRoot = getLegacyHotupdatePrefixRoot();

  if (!secretId || !secretKey || !bucket || !region) {
    const err = new Error('cos_config_missing');
    err.code = 'COS_CONFIG_MISSING';
    throw err;
  }

  // Lazy require so local mode does not need this dependency loaded.
  const COS = require('cos-nodejs-sdk-v5');
  const cos = new COS({ SecretId: secretId, SecretKey: secretKey });
  const versionPrefixes = [
    `${prefixRoot}/${platform}/${version}/`,
    `${legacyPrefixRoot}/${version}/`
  ];

  async function listAllKeysByPrefix(prefix) {
    const all = [];
    let marker = '';
    while (true) {
      const page = await new Promise((resolve, reject) => {
        cos.getBucket(
          {
            Bucket: bucket,
            Region: region,
            Prefix: prefix,
            Marker: marker,
            MaxKeys: 1000
          },
          (error, data) => (error ? reject(error) : resolve(data))
        );
      });
      const keys = ((page && page.Contents) || []).map((item) => item.Key).filter(Boolean);
      all.push(...keys);
      const isTruncated = String(page && page.IsTruncated) === 'true';
      if (!isTruncated || !keys.length) {
        break;
      }
      marker = keys[keys.length - 1];
    }
    return all;
  }

  async function deleteKeys(keys) {
    if (!keys.length) {
      return;
    }
    const chunks = [];
    for (let i = 0; i < keys.length; i += 1000) {
      chunks.push(keys.slice(i, i + 1000));
    }
    for (const chunk of chunks) {
      await new Promise((resolve, reject) => {
        cos.deleteMultipleObject(
          {
            Bucket: bucket,
            Region: region,
            Objects: chunk.map((key) => ({ Key: key })),
            Quiet: true
          },
          (error) => (error ? reject(error) : resolve())
        );
      });
    }
  }

  // Keep bucket content deterministic for one version path.
  // This avoids stale files like ".../100/100/*" from previous uploads.
  for (const versionPrefix of versionPrefixes) {
    const staleKeys = await listAllKeysByPrefix(versionPrefix);
    await deleteKeys(staleKeys);
  }

  const files = await listFiles(sourceDir);
  for (const versionPrefix of versionPrefixes) {
    for (const file of files) {
      const rel = normalizeRelPath(path.relative(sourceDir, file));
      const key = `${versionPrefix}${rel}`;
      const body = await fs.readFile(file);
      await new Promise((resolve, reject) => {
        cos.putObject(
          {
            Bucket: bucket,
            Region: region,
            Key: key,
            Body: body
          },
          (error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          }
        );
      });
    }
  }
}

async function syncUploadedVersion({ platform, version, sourceDir }) {
  const driver = (process.env.STORAGE_DRIVER || 'local').toLowerCase();
  if (driver !== 'cos') {
    return;
  }

  if (process.env.PULZZ_COS_MOCK_ROOT) {
    await syncToCosMock({ platform, version, sourceDir });
    return;
  }

  await syncToCosReal({ platform, version, sourceDir });
}

module.exports = {
  syncUploadedVersion
};
