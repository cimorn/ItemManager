import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = path.join(__dirname, '..', '..');

describe('desktop app name', () => {
  it('uses 物品管理 for package metadata and window titles', async () => {
    const packageJson = JSON.parse(
      await fs.readFile(path.join(projectRoot, 'package.json'), 'utf8')
    );
    const indexHtml = await fs.readFile(path.join(projectRoot, 'index.html'), 'utf8');
    const mainProcess = await fs.readFile(path.join(projectRoot, 'electron', 'main.js'), 'utf8');

    expect(packageJson.name).toBe('item-manager');
    expect(packageJson.description).toBe('物品管理工具');
    expect(packageJson.build.productName).toBe('物品管理');
    expect(indexHtml).toContain('<title>物品管理</title>');
    expect(mainProcess).toContain("title: '物品管理'");
  });
});
