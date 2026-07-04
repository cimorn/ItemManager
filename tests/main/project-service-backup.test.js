const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createProject, saveProject } = require('../../src/main/project/project-service');

describe('project service backups', () => {
  it('backs up existing project files before saving new data', async () => {
    const parentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'item-manager-backup-'));
    const project = await createProject({ parentDir, projectName: '库存' });

    const firstSaved = await saveProject({
      ...project,
      items: [{ id: 'item_1', name: '旧物品', tags: ['YF-001'] }]
    });
    await saveProject({
      ...firstSaved,
      items: [{ id: 'item_1', name: '新物品', tags: ['YF-002'] }]
    });

    const backupRoot = path.join(project.paths.projectDir, 'backups');
    const backupDirs = await fs.readdir(backupRoot);
    const backedUpProjectFiles = await Promise.all(
      backupDirs.map((dirName) => fs.readFile(path.join(backupRoot, dirName, 'project.json'), 'utf8'))
    );

    expect(backedUpProjectFiles.some((raw) => raw.includes('旧物品'))).toBe(true);
    expect(await fs.readFile(project.paths.projectFile, 'utf8')).toContain('新物品');
    await expect(fs.access(project.paths.itemsFile)).rejects.toThrow();
  });
});
