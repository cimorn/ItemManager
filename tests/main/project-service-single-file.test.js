const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createProject, openProject, saveProject } = require('../../src/main/project/project-service');

describe('project service single file storage', () => {
  it('saves project data into one project.json file', async () => {
    const parentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'item-manager-single-file-'));
    const project = await createProject({ parentDir, projectName: '库存' });
    const savedProject = await saveProject({
      ...project,
      categories: [{ id: 'cat_1', name: '数码', level: 1, parentId: null }],
      locations: [{ id: 'loc_1', name: '日常', level: 1, parentId: null }],
      items: [{ id: 'item_1', name: '键盘', categoryId: 'cat_1', locationId: 'loc_1' }]
    });

    const projectJson = JSON.parse(await fs.readFile(savedProject.paths.projectFile, 'utf8'));

    expect(projectJson.meta.name).toBe('库存');
    expect(projectJson.categories).toHaveLength(1);
    expect(projectJson.locations).toHaveLength(1);
    expect(projectJson.items).toHaveLength(1);
    await expect(fs.access(savedProject.paths.categoriesFile)).rejects.toThrow();
    await expect(fs.access(savedProject.paths.locationsFile)).rejects.toThrow();
    await expect(fs.access(savedProject.paths.itemsFile)).rejects.toThrow();
  });

  it('opens legacy split json projects and rewrites them as one project.json on save', async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'item-manager-legacy-file-'));

    await fs.writeFile(path.join(projectDir, 'project.json'), JSON.stringify({ name: '旧库存' }), 'utf8');
    await fs.writeFile(
      path.join(projectDir, 'categories.json'),
      JSON.stringify([{ id: 'cat_1', name: '数码', level: 1, parentId: null }]),
      'utf8'
    );
    await fs.writeFile(
      path.join(projectDir, 'locations.json'),
      JSON.stringify([{ id: 'loc_1', name: '桌下', level: 1, parentId: null }]),
      'utf8'
    );
    await fs.writeFile(
      path.join(projectDir, 'items.json'),
      JSON.stringify([{ id: 'item_1', name: 'NAS', categoryId: 'cat_1', locationId: 'loc_1' }]),
      'utf8'
    );

    const openedProject = await openProject(projectDir);
    expect(openedProject.meta.name).toBe('旧库存');
    expect(openedProject.items[0].name).toBe('NAS');

    await saveProject(openedProject);
    const projectJson = JSON.parse(await fs.readFile(openedProject.paths.projectFile, 'utf8'));

    expect(projectJson.items[0].name).toBe('NAS');
    await expect(fs.access(openedProject.paths.categoriesFile)).rejects.toThrow();
    await expect(fs.access(openedProject.paths.locationsFile)).rejects.toThrow();
    await expect(fs.access(openedProject.paths.itemsFile)).rejects.toThrow();
  });
});
