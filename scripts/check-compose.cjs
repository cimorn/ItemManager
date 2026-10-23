'use strict';
// Uses a unique project, synthetic credentials and a new disposable database.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const image = process.argv[2];
if (!image || !/^[a-zA-Z0-9._/:-]+$/.test(image)) throw Error('Image argument required');
const project = `itemmanager-check-${process.pid}-${randomBytes(4).toString('hex')}`;
const emptyEnv = path.join(os.tmpdir(), `${project}.env`);
fs.writeFileSync(emptyEnv, '', { flag: 'wx' });
const origin = 'http://127.0.0.1:3000';
const env = { ...process.env,
  STORAGE_IMAGE: image, STORAGE_BIND_ADDRESS: '127.0.0.1', STORAGE_BIND_PORT: '0',
  STORAGE_PUBLIC_ORIGIN: origin, STORAGE_ALLOW_HTTP: 'true', STORAGE_PREVIEW: 'false',
  STORAGE_PASSWORD: randomBytes(24).toString('hex'), STORAGE_PRIVACY_PASSWORD: randomBytes(24).toString('hex'),
  STORAGE_SESSION_SECRET: randomBytes(32).toString('hex'), STORAGE_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  STORAGE_MONGO_ROOT_USERNAME: 'fixture_root', STORAGE_MONGO_ROOT_PASSWORD: randomBytes(24).toString('hex'),
  STORAGE_MONGO_USERNAME: 'fixture_app', STORAGE_MONGO_PASSWORD: randomBytes(24).toString('hex'),
  ALI_OSS_BUCKET: 'fixture-inventory-photos', ALI_OSS_REGION: 'cn-hangzhou',
  ALI_OSS_ENDPOINT: 'https://oss-cn-hangzhou.aliyuncs.com',
  ALI_OSS_ACCESS_KEY_ID: 'fixture-key-id', ALI_OSS_ACCESS_KEY_SECRET: 'fixture-key-secret'
};
const docker = (...args) => execFileSync('docker', args, { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 240000 }).trim();
const compose = (...args) => docker('compose', '--env-file', emptyEnv, '-p', project, '-f', path.join(root, 'compose.yaml'), ...args);
(async () => {
  try {
    compose('config', '--quiet');
    docker('pull', 'mongo:7.0');
    compose('up', '-d', '--pull', 'never', '--wait', '--wait-timeout', '120');
    const port = compose('port', 'storage', '3000').split(':').at(-1);
    const response = await fetch(`http://127.0.0.1:${port}/api/login`, {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: env.STORAGE_PASSWORD }), signal: AbortSignal.timeout(10000)
    });
    assert.equal(response.status, 200);
    assert.ok((await response.json()).csrfToken);
    compose('stop', 'storage');
    const auth = "const d=db.getSiblingDB('storage');if(!d.auth(process.env.STORAGE_MONGO_USERNAME,process.env.STORAGE_MONGO_PASSWORD))quit(1);";
    compose('exec', '-T', 'mongodb-storage', 'mongosh', '--quiet', '--eval', auth + "d.backupProof.insertOne({key:'fixture'});");
    compose('exec', '-T', 'mongodb-storage', 'sh', '-c', 'mongodump --gzip --archive=/tmp/storage.archive.gz --db storage --username "$STORAGE_MONGO_USERNAME" --password "$STORAGE_MONGO_PASSWORD" --authenticationDatabase storage');
    compose('exec', '-T', 'mongodb-storage', 'mongosh', '--quiet', '--eval', auth + 'd.backupProof.drop();');
    compose('exec', '-T', 'mongodb-storage', 'sh', '-c', 'mongorestore --gzip --archive=/tmp/storage.archive.gz --nsInclude="storage.*" --drop --username "$STORAGE_MONGO_USERNAME" --password "$STORAGE_MONGO_PASSWORD" --authenticationDatabase storage');
    compose('exec', '-T', 'mongodb-storage', 'mongosh', '--quiet', '--eval', auth + "if(d.backupProof.countDocuments({key:'fixture'})!==1)quit(1);");
    console.log('Compose passed: architecture, fresh volume, production login, custom bucket, database backup and restore.');
  } catch {
    console.error('Disposable Compose deployment failed; no production configuration was used.');
    process.exitCode = 1;
  } finally {
    try { compose('down', '--volumes', '--remove-orphans'); } catch { process.exitCode = 1; }
    fs.unlinkSync(emptyEnv);
  }
})();
