const fs = require('node:fs/promises');
const path = require('node:path');

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyEntry(sourcePath, targetPath) {
  const stat = await fs.stat(sourcePath);
  if (stat.isDirectory()) {
    await fs.mkdir(targetPath, { recursive: true });
    const entries = await fs.readdir(sourcePath);
    for (const entry of entries) {
      await copyEntry(path.join(sourcePath, entry), path.join(targetPath, entry));
    }
    return;
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
}

async function copyUnpackedApp({ unpackedDir, distDir, preserveData = true }) {
  const entries = await fs.readdir(unpackedDir);
  const keepExistingData = preserveData && (await pathExists(path.join(distDir, 'data')));

  for (const entry of entries) {
    if (entry === 'data' && keepExistingData) {
      continue;
    }

    await copyEntry(path.join(unpackedDir, entry), path.join(distDir, entry));
  }
}

async function moveDesktopZips({ desktopDir, distDir }) {
  if (!(await pathExists(desktopDir))) {
    return;
  }

  const entries = await fs.readdir(desktopDir);
  for (const entry of entries) {
    if (entry.toLowerCase().endsWith('.zip')) {
      await fs.copyFile(path.join(desktopDir, entry), path.join(distDir, entry));
    }
  }
}

async function readPackageInfo(projectRoot) {
  const packagePath = path.join(projectRoot, 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'));

  return {
    productName: packageJson.build?.productName,
    releaseName: process.env.APP_RELEASE_NAME?.trim() || 'ItemManager'
  };
}

function formatReleaseDate(date = new Date()) {
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

function getReleaseDate() {
  return process.env.APP_RELEASE_DATE?.trim() || formatReleaseDate();
}

async function renameExeWithVersion({ distDir, projectRoot }) {
  const { releaseName } = await readPackageInfo(projectRoot);
  const entries = await fs.readdir(distDir);
  const exeNames = entries.filter((entry) => entry.toLowerCase().endsWith('.exe'));
  const releasePrefix = `${releaseName.toLowerCase()}-`;
  const isReleaseExe = (entry) => entry.toLowerCase().startsWith(releasePrefix);
  const exeName =
    exeNames.find((entry) => !isReleaseExe(entry)) || exeNames[0];

  if (!exeName) {
    return exeName ? path.join(distDir, exeName) : null;
  }

  const versionedExeName = `${releaseName}-V${getReleaseDate()}.exe`;
  const sourcePath = path.join(distDir, exeName);
  const targetPath = path.join(distDir, versionedExeName);

  if (sourcePath !== targetPath) {
    await fs.rm(targetPath, { force: true });
    await fs.rename(sourcePath, targetPath);
  }

  for (const staleExeName of exeNames) {
    const staleExePath = path.join(distDir, staleExeName);
    if (staleExePath !== targetPath && staleExePath !== sourcePath) {
      await fs.rm(staleExePath, { force: true });
    }
  }

  return targetPath;
}

async function flattenDesktopDist({
  projectRoot = path.join(__dirname, '..'),
  preserveData = true
} = {}) {
  const distDir = path.join(projectRoot, 'dist');
  const desktopDir = path.join(distDir, 'desktop');
  const unpackedDir = path.join(desktopDir, 'win-unpacked');

  if (!(await pathExists(unpackedDir))) {
    throw new Error(`找不到桌面打包目录: ${unpackedDir}`);
  }

  await copyUnpackedApp({ unpackedDir, distDir, preserveData });
  await moveDesktopZips({ desktopDir, distDir });
  const exePath = await renameExeWithVersion({ distDir, projectRoot });
  await fs.rm(desktopDir, { recursive: true, force: true });
  await fs.rm(path.join(distDir, 'renderer'), { recursive: true, force: true });

  return {
    distDir,
    exePath,
    dataDir: path.join(distDir, 'data')
  };
}

if (require.main === module) {
  flattenDesktopDist()
    .then((result) => {
      console.log(`桌面版已展开到 ${result.distDir}`);
    })
    .catch((error) => {
      console.error(error?.message || error);
      process.exit(1);
    });
}

module.exports = {
  formatReleaseDate,
  flattenDesktopDist
};
