const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const AdmZip = require('adm-zip');

function buildMultipart(fields, file) {
  const boundary = `----pulzz-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const parts = [];

  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }

  if (file) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\nContent-Type: application/zip\r\n\r\n`
      )
    );
    parts.push(file.content);
    parts.push(Buffer.from('\r\n'));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

async function setupApp() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pulzz-test-'));
  const appRoot = path.join(tempRoot, 'app');

  process.env.PULZZ_ROOT = tempRoot;
  process.env.PULZZ_APP_ROOT = appRoot;
  process.env.PULZZ_CDN_ROOT = path.join(tempRoot, 'cdn');
  process.env.PULZZ_STATE_PATH = path.join(appRoot, 'config', 'state.json');

  delete require.cache[require.resolve('../src/lib/paths')];
  delete require.cache[require.resolve('../src/lib/state')];
  delete require.cache[require.resolve('../src/lib/lock')];
  delete require.cache[require.resolve('../src/lib/response')];
  delete require.cache[require.resolve('../src/server')];
  const { createServer } = require('../src/server');
  const app = await createServer();

  return {
    app,
    tempRoot,
    cleanup: async () => {
      await app.close();
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  };
}

test('client api returns fixed app version', async () => {
  const ctx = await setupApp();
  try {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/GameAppVersion/GetVersion', payload: { AppVersion: '9.9.9' } });
    assert.equal(res.statusCode, 200);
    const json = res.json();
    assert.equal(json.Code, 0);
    const data = JSON.parse(json.Data);
    assert.equal(data.AppVersion, '1.0.0');
  } finally {
    await ctx.cleanup();
  }
});

test('upload invalid filename returns 4001', async () => {
  const ctx = await setupApp();
  try {
    const zip = new AdmZip();
    zip.addFile('x.txt', Buffer.from('ok'));
    const mp = buildMultipart({ platform: 'wxmini' }, { filename: 'abc.zip', content: zip.toBuffer() });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/admin/upload',
      headers: { 'content-type': mp.contentType },
      payload: mp.body
    });

    assert.equal(res.statusCode, 400);
    const json = res.json();
    assert.equal(json.Code, 4001);
  } finally {
    await ctx.cleanup();
  }
});

test('upload then publish updates current version and syncs files', async () => {
  const ctx = await setupApp();
  try {
    const zip = new AdmZip();
    zip.addFile('100/config.json', Buffer.from('{"k":1}'));
    const mp = buildMultipart({ platform: 'wxmini' }, { filename: '100.zip', content: zip.toBuffer() });

    const uploadRes = await ctx.app.inject({
      method: 'POST',
      url: '/admin/upload',
      headers: { 'content-type': mp.contentType },
      payload: mp.body
    });

    assert.equal(uploadRes.statusCode, 200);
    assert.equal(uploadRes.json().Code, 0);

    const publishRes = await ctx.app.inject({
      method: 'POST',
      url: '/admin/publish',
      payload: { platform: 'wxmini', version: '100' }
    });

    assert.equal(publishRes.statusCode, 200);
    assert.equal(publishRes.json().Code, 0);

    const state = JSON.parse(await fs.readFile(path.join(ctx.tempRoot, 'app', 'config', 'state.json'), 'utf8'));
    assert.equal(state.currentVersion, '100');

    const synced = await fs.readFile(
      path.join(
        ctx.tempRoot,
        'cdn/hotupdate/com.smartdog.bbqgame/WebGLWxMiniGame/1.0.0/WxMiniGame/DefaultPackage/100/config.json'
      ),
      'utf8'
    );
    assert.equal(synced, '{"k":1}');
  } finally {
    await ctx.cleanup();
  }
});
