'use strict';
// CI integration check; uses synthetic preview storage, never production secrets.
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const image = process.argv[2];
if (!image || !/^[a-zA-Z0-9._/:-]+$/.test(image)) throw Error('Image argument required');
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const name = `storage-check-${process.pid}`;
(async () => {
  const audit = `const fs=require('fs'),assert=require('assert/strict');assert.notEqual(process.getuid(),0);for(const p of ['/app/.env','/app/data','/app/历史数据','/app/.git','/app/docs','/app/electron','/app/desktop','/app/node_modules/electron','/app/node_modules/electron-builder','/app/node_modules/react'])assert.equal(fs.existsSync(p),false,p);assert.ok(fs.existsSync('/app/dist/renderer/index.html'));require('express');require('mongodb');require('jpeg-js');require('pngjs');`;
  docker('run', '--rm', '--entrypoint', 'node', image, '-e', audit);
  docker('run', '-d', '--name', name, '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m,uid=1000,gid=10', '-p', '127.0.0.1::3000', '-e', 'STORAGE_PREVIEW=true', '-e', 'STORAGE_PUBLIC_ORIGIN=http://127.0.0.1:3000', image);
  const port = docker('port', name, '3000/tcp').split(':').at(-1);
  const origin = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let n = 0; n < 60; n++) {
    try { if ((await fetch(`${origin}/api/health`)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'Container health check failed');
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /entry-login/);
  for (const [file, type] of [['favicon.ico', /^image\/(?:x-icon|vnd\.microsoft\.icon)/], ['icon.png', /^image\/png/]]) {
    const icon = await fetch(`${origin}/${file}`);
    assert.equal(icon.status, 200);
    assert.match(icon.headers.get('content-type'), type);
    assert.ok((await icon.arrayBuffer()).byteLength > 0);
  }
  assert.equal((await fetch(`${origin}/api/project`)).status, 401);
  console.log('Container passed: non-root, read-only, runtime modules, login page, protected inventory, excluded private paths.');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => {
  try { docker('rm', '-f', name); } catch {}
});
