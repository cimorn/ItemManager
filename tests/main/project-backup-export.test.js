const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createProject, exportProjectBackup, saveProject } = require('../../src/main/project/project-service');

describe('project data backup export', () => {
  it('exports the complete project folder into a timestamped backup folder', async () => {
    const parentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'item-manager-backup-source-'));
    const exportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'item-manager-backup-target-'));
    const project = await createProject({ parentDir, projectName: '库存' });
    const savedProject = await saveProject({
      ...project,
      items: [{ id: 'item_1', name: '键盘', imagePath: 'images/数码/设备/keyboard.jpg' }]
    });

    await fs.mkdir(path.join(savedProject.paths.projectDir, 'images', '数码', '设备'), { recursive: true });
    await fs.writeFile(path.join(savedProject.paths.projectDir, 'images', '数码', '设备', 'keyboard.jpg'), 'image');

    const result = await exportProjectBackup({
      project: savedProject,
      targetParentDir: exportDir
    });

    expect(path.dirname(result.backupDir)).toBe(exportDir);
    expect(path.basename(result.backupDir)).toContain('库存-数据备份-');
    await expect(fs.readFile(path.join(result.backupDir, 'project.json'), 'utf8')).resolves.toContain('键盘');
    await expect(fs.readFile(path.join(result.backupDir, 'images', '数码', '设备', 'keyboard.jpg'), 'utf8')).resolves.toBe('image');
  });

  it('rejects backup targets inside the project data folder', async () => {
    const parentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'item-manager-backup-guard-'));
    const project = await createProject({ parentDir, projectName: '库存' });
    const nestedTarget = path.join(project.paths.projectDir, 'exports');

    await fs.mkdir(nestedTarget, { recursive: true });

    await expect(
      exportProjectBackup({
        project,
        targetParentDir: nestedTarget
      })
    ).rejects.toThrow('备份位置不能放在当前 data 目录里面');
  });
});
