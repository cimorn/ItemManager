const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { createRequire } = require('node:module');
const { APP_ID, SITE_URL } = require('../src/policy.cjs');

const CLIENT_FILES = [
  'src/client.cjs',
  'src/policy.cjs',
  'src/pages/connecting.html',
  'src/pages/unavailable.html',
  'assets/app-icon.png',
  'assets/app-icon.ico'
];

async function buildDesktop() {
  const root = path.resolve(__dirname, '..');
  const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const version = metadata.version;
  // Build outside the workspace so the staged dependency-free app cannot inherit web packages.
  const runtimeRoot = path.join(os.tmpdir(), 'storage-desktop-builds');
  const stage = path.join(runtimeRoot, `desktop-build-${crypto.randomUUID()}`);
  const appDir = path.join(stage, 'app');
  const artifactName = `物品管理-桌面版-${version}.exe`;
  const outputDir = path.resolve(root, '..', 'dist', `Desktop-${version}`);
  await fs.mkdir(appDir, { recursive: true });
  try {
    for (const file of CLIENT_FILES) {
      const target = path.join(appDir, file);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(path.join(root, file), target);
    }
    await fs.writeFile(path.join(appDir, 'package.json'), JSON.stringify({
      name: 'itemmanager-desktop', version, productName: '物品管理',
      description: metadata.description, author: metadata.author,
      packageManager: metadata.packageManager, main: 'src/client.cjs'
    }, null, 2));
    await fs.writeFile(path.join(appDir, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\nimporters:\n  .: {}\n");
    const { build, Platform, Arch } = require('electron-builder');
    const electronDist = path.join(path.dirname(require.resolve('electron/package.json')), 'dist');
    const electronVersion = (await fs.readFile(path.join(electronDist, 'version'), 'utf8')).trim();
    await build({
      projectDir: appDir,
      targets: Platform.WINDOWS.createTarget(['portable'], Arch.x64),
      config: {
        appId: APP_ID, productName: '物品管理',
        electronVersion, electronDist, npmRebuild: false, asar: true,
        directories: { output: path.join(stage, 'build') },
        files: [...CLIENT_FILES, 'package.json'],
        extraFiles: null, extraResources: null,
        win: { icon: path.join(root, 'assets/app-icon.ico'), executableName: 'Storage-Desktop', signAndEditExecutable: true },
        portable: { unpackDirName: true, requestExecutionLevel: 'user' },
        compression: 'normal', artifactName, publish: null
      },
      publish: 'never'
    });
    const builderRequire = createRequire(require.resolve('electron-builder'));
    const libRequire = createRequire(builderRequire.resolve('app-builder-lib'));
    const asar = libRequire('@electron/asar');
    const archive = path.join(stage, 'build/win-unpacked/resources/app.asar');
    const packedFiles = asar.listPackage(archive).map(file => file.replace(/^[/\\]/, '').replace(/\\/g, '/'))
      .filter(file => !asar.statFile(archive, path.normalize(file)).files).sort();
    const expectedFiles = [...CLIENT_FILES, 'package.json'].sort();
    if (JSON.stringify(packedFiles) !== JSON.stringify(expectedFiles)) throw new Error('Unexpected files in desktop archive');
    for (const file of CLIENT_FILES) {
      if (!asar.extractFile(archive, path.normalize(file)).equals(await fs.readFile(path.join(root, file)))) throw new Error(`Archive mismatch: ${file}`);
    }
    const packageInfo = JSON.parse(asar.extractFile(archive, 'package.json').toString());
    if (packageInfo.main !== 'src/client.cjs' || packageInfo.dependencies) throw new Error('Unexpected desktop entry or dependencies');
    const source = path.join(stage, 'build', artifactName);
    const bytes = await fs.readFile(source);
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    await fs.mkdir(outputDir, { recursive: true });
    const target = path.join(outputDir, artifactName);
    await fs.copyFile(source, target);
    if (crypto.createHash('sha256').update(await fs.readFile(target)).digest('hex') !== sha256) throw new Error('EXE copy verification failed');
    const result = { file: target, bytes: bytes.length, sha256, version, electron: electronVersion, packagedFiles: packedFiles };
    await fs.writeFile(path.join(outputDir, '构建校验.json'), JSON.stringify(result, null, 2));
    await fs.writeFile(path.join(outputDir, '使用说明.md'), `# 物品管理桌面客户端\n\n双击 EXE 打开 ${SITE_URL}，使用网站账号登录。需要联网，网站服务器需正常运行。\n\n菜单可重新连接或在浏览器中打开。便携数据目录为 EXE 同级的 data/nas-client/；更新时替换 EXE 并保留 data/。关闭程序会清除内存中的登录会话。物品及附件保存在网站服务器，需在服务器端备份。\n`);
    return result;
  } finally {
    const relative = path.relative(runtimeRoot, stage);
    if (relative.startsWith('desktop-build-') && !relative.includes(path.sep) && !path.isAbsolute(relative)) {
      await fs.rm(stage, { recursive: true, force: true });
    }
  }
}

if (require.main === module) {
  buildDesktop().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    console.error(error.message); process.exit(1);
  });
}
module.exports = { buildDesktop, CLIENT_FILES };
