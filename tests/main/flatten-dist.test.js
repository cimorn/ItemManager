import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { flattenDesktopDist, formatReleaseDate } from '../../electron/flatten-dist';

const tempDirs = [];

async function makeTempProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'item-manager-dist-'));
  tempDirs.push(root);
  return root;
}

afterEach(async () => {
  delete process.env.APP_RELEASE_DATE;
  delete process.env.APP_RELEASE_NAME;

  while (tempDirs.length) {
    await fs.rm(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe('flattenDesktopDist', () => {
  it('formats release dates with two-digit years', () => {
    expect(formatReleaseDate(new Date(2027, 0, 1))).toBe('27.01.01');
  });

  it('expands win-unpacked into dist root and removes nested build folders', async () => {
    const projectRoot = await makeTempProject();
    const unpackedDir = path.join(projectRoot, 'dist', 'desktop', 'win-unpacked');

    await fs.mkdir(path.join(unpackedDir, 'resources'), { recursive: true });
    await fs.mkdir(path.join(unpackedDir, 'data'), { recursive: true });
    await fs.mkdir(path.join(projectRoot, 'dist', 'renderer'), { recursive: true });
    await fs.writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ version: '26.03.30' }));
    await fs.writeFile(path.join(unpackedDir, '物品管理.exe'), 'exe');
    await fs.writeFile(path.join(unpackedDir, 'resources', 'app.asar'), 'asar');
    await fs.writeFile(path.join(unpackedDir, 'data', 'project.json'), 'project');
    await fs.writeFile(path.join(projectRoot, 'dist', 'desktop', '物品管理-26.3.30-win.zip'), 'zip');
    await fs.writeFile(path.join(projectRoot, 'dist', 'renderer', 'index.html'), 'renderer');

    process.env.APP_RELEASE_DATE = '27.01.01';

    const result = await flattenDesktopDist({ projectRoot });

    await expect(fs.readFile(path.join(projectRoot, 'dist', 'ItemManager-V27.01.01.exe'), 'utf8')).resolves.toBe('exe');
    await expect(fs.access(path.join(projectRoot, 'dist', '物品管理.exe'))).rejects.toThrow();
    await expect(fs.readFile(path.join(projectRoot, 'dist', 'resources', 'app.asar'), 'utf8')).resolves.toBe('asar');
    await expect(fs.readFile(path.join(projectRoot, 'dist', 'data', 'project.json'), 'utf8')).resolves.toBe('project');
    await expect(fs.readFile(path.join(projectRoot, 'dist', '物品管理-26.3.30-win.zip'), 'utf8')).resolves.toBe('zip');
    expect(result.exePath).toBe(path.join(projectRoot, 'dist', 'ItemManager-V27.01.01.exe'));
    await expect(fs.access(path.join(projectRoot, 'dist', 'desktop'))).rejects.toThrow();
    await expect(fs.access(path.join(projectRoot, 'dist', 'renderer'))).rejects.toThrow();
  });

  it('keeps existing dist data when flattening a rebuilt app', async () => {
    const projectRoot = await makeTempProject();
    const unpackedDir = path.join(projectRoot, 'dist', 'desktop', 'win-unpacked');

    await fs.mkdir(path.join(unpackedDir, 'data'), { recursive: true });
    await fs.mkdir(path.join(projectRoot, 'dist', 'data'), { recursive: true });
    await fs.writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ version: '26.03.30' }));
    await fs.writeFile(path.join(unpackedDir, '物品管理.exe'), 'exe');
    await fs.writeFile(path.join(unpackedDir, 'data', 'project.json'), 'fresh');
    await fs.writeFile(path.join(projectRoot, 'dist', 'data', 'project.json'), 'user data');

    await flattenDesktopDist({ projectRoot });

    await expect(fs.readFile(path.join(projectRoot, 'dist', 'data', 'project.json'), 'utf8')).resolves.toBe('user data');
  });
});
