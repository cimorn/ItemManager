import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = path.join(__dirname, '..', '..');

async function readProjectFile(fileName) {
  return fs.readFile(path.join(projectRoot, fileName), 'utf8');
}

describe('project documentation', () => {
  it('keeps concise Chinese and English desktop-app readmes with screenshots', async () => {
    const readmeZh = await readProjectFile('README.md');
    const readmeEn = await readProjectFile('README.en.md');
    const changelog = await readProjectFile('CHANGELOG.md');
    const license = await readProjectFile('LICENSE');
    const demoProject = JSON.parse(await readProjectFile('docs/demo-data/project.json'));

    expect(readmeZh).toContain('# 物品管理');
    expect(readmeZh).toContain('[English](README.en.md)');
    expect(readmeZh).toContain('## 怎么用');
    expect(readmeZh).toContain('ItemManager-V26.07.05.exe');
    expect(readmeZh).toContain('data/project.json');
    expect(readmeZh).toContain('README 截图使用 `docs/demo-data/project.json` 演示数据');
    expect(readmeZh).toContain('例如 `BG-001`、`GJ-003`、`SN-002`');
    expect(readmeZh).toContain('![物品总览](docs/images/items-overview.png)');
    expect(readmeZh).toContain('![编辑物品](docs/images/item-editor.png)');
    expect(readmeZh).toContain('![分类管理](docs/images/category-manager.png)');
    expect(readmeZh).toContain('![位置管理](docs/images/location-manager.png)');
    expect(readmeZh).toContain('![标签管理](docs/images/tag-manager.png)');
    expect(readmeZh).not.toContain('仓库管理');
    expect(readmeZh).not.toContain('Zeabur');
    expect(readmeZh).not.toContain('MongoDB');
    expect(readmeZh).not.toContain('OSS');
    expect(readmeZh).not.toContain('YF-001');
    expect(readmeZh).not.toContain('SM-023');
    expect(readmeZh).not.toContain('NAS-001');

    expect(readmeEn).toContain('# Item Manager');
    expect(readmeEn).toContain('[中文](README.md)');
    expect(readmeEn).toContain('## Usage');
    expect(readmeEn).toContain('ItemManager-V26.07.05.exe');
    expect(readmeEn).toContain('README screenshots use `docs/demo-data/project.json` demo data');
    expect(readmeEn).toContain('such as `BG-001`, `GJ-003`, or `SN-002`');
    expect(readmeEn).toContain('![Items overview](docs/images/items-overview.png)');
    expect(readmeEn).toContain('![Item editor](docs/images/item-editor.png)');
    expect(readmeEn).toContain('![Category manager](docs/images/category-manager.png)');
    expect(readmeEn).toContain('![Location manager](docs/images/location-manager.png)');
    expect(readmeEn).toContain('![Tag manager](docs/images/tag-manager.png)');
    expect(readmeEn).not.toContain('Warehouse Manager');
    expect(readmeEn).not.toContain('YF-001');
    expect(readmeEn).not.toContain('SM-023');
    expect(readmeEn).not.toContain('NAS-001');

    expect(changelog).toContain('# Changelog');
    expect(changelog).toContain('Renamed the app to 物品管理.');
    expect(changelog).toContain('Changed the project from a web app to an Electron desktop app.');

    expect(license).toContain('MIT License');
    expect(license).toContain('cimorn');

    expect(demoProject.items.map((item) => item.name)).toEqual(['标签机', '收纳盒', '螺丝刀套装', '清洁刷']);
    expect(demoProject.items.every((item) => item.id.startsWith('demo_item_'))).toBe(true);
    expect(JSON.stringify(demoProject)).not.toContain('板鞋');
    expect(JSON.stringify(demoProject)).not.toContain('Champion');
    expect(JSON.stringify(demoProject)).not.toContain('NAS');
  });
});
