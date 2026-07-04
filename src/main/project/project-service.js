const fs = require('node:fs/promises');
const path = require('node:path');

const { resolveProjectPaths } = require('./project-paths');
const { createEmptyProjectData, nowIso } = require('./project-schema');
const { migrateProjectData } = require('./project-migration');
const { validateProjectData } = require('./project-validator');
const { sanitizeSegment } = require('./project-image-service');

const BACKUP_LIMIT = 20;
const PROJECT_FILE_NAMES = ['project.json', 'categories.json', 'locations.json', 'items.json'];
const LEGACY_PROJECT_FILE_NAMES = ['categories.json', 'locations.json', 'items.json'];

async function ensureProjectDirectories(paths) {
  await fs.mkdir(paths.projectDir, { recursive: true });
  await fs.mkdir(paths.exportsDir, { recursive: true });
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

function createBackupStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function isSameOrInside(parentDir, childDir) {
  const relativePath = path.relative(path.resolve(parentDir), path.resolve(childDir));
  return !relativePath || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

async function createUniqueDirectory(baseDir) {
  let candidate = baseDir;
  let index = 1;

  while (await exists(candidate)) {
    candidate = `${baseDir}-${index}`;
    index += 1;
  }

  return candidate;
}

async function pruneBackups(backupRoot) {
  const entries = await fs.readdir(backupRoot, { withFileTypes: true });
  const backupDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));

  await Promise.all(
    backupDirs.slice(BACKUP_LIMIT).map((dirName) =>
      fs.rm(path.join(backupRoot, dirName), {
        recursive: true,
        force: true
      })
    )
  );
}

async function backupProjectFiles(paths) {
  if (!(await exists(paths.projectFile))) {
    return null;
  }

  const backupRoot = path.join(paths.projectDir, 'backups');
  const backupDir = path.join(backupRoot, createBackupStamp());
  await fs.mkdir(backupDir, { recursive: true });

  await Promise.all(
    PROJECT_FILE_NAMES.map(async (fileName) => {
      const sourcePath = path.join(paths.projectDir, fileName);
      if (await exists(sourcePath)) {
        await fs.copyFile(sourcePath, path.join(backupDir, fileName));
      }
    })
  );
  await pruneBackups(backupRoot);

  return backupDir;
}

async function writeProjectFiles(paths, project) {
  await ensureProjectDirectories(paths);

  await fs.writeFile(paths.projectFile, `${JSON.stringify(toProjectFile(project), null, 2)}\n`, 'utf8');
  await Promise.all(LEGACY_PROJECT_FILE_NAMES.map((fileName) => fs.rm(path.join(paths.projectDir, fileName), { force: true })));
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }

    throw error;
  }
}

async function assertProjectExists(paths) {
  try {
    await fs.access(paths.projectFile);
  } catch (error) {
    if (error.code === 'ENOENT') {
      const notFoundError = new Error('项目不存在');
      notFoundError.code = 'PROJECT_NOT_FOUND';
      throw notFoundError;
    }

    throw error;
  }
}

function toProjectFile(project) {
  return {
    meta: project.meta || {},
    categories: project.categories || [],
    locations: project.locations || [],
    items: project.items || []
  };
}

function isSingleProjectFile(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value.meta || Array.isArray(value.categories) || Array.isArray(value.locations) || Array.isArray(value.items))
  );
}

async function readProjectFiles(paths) {
  const projectFile = await readJson(paths.projectFile, {});

  if (isSingleProjectFile(projectFile)) {
    return {
      meta: projectFile.meta || {},
      categories: projectFile.categories || [],
      locations: projectFile.locations || [],
      items: projectFile.items || []
    };
  }

  return {
    meta: projectFile || {},
    categories: await readJson(paths.categoriesFile, []),
    locations: await readJson(paths.locationsFile, []),
    items: await readJson(paths.itemsFile, [])
  };
}

function buildProjectResult(paths, project) {
  return {
    paths,
    meta: project.meta,
    categories: project.categories,
    locations: project.locations,
    items: project.items
  };
}

async function createProject({ parentDir, projectName }) {
  const projectDir = path.join(parentDir, projectName);
  const paths = resolveProjectPaths(projectDir);
  const project = migrateProjectData(createEmptyProjectData(projectName));

  await writeProjectFiles(paths, project);

  return buildProjectResult(paths, project);
}

async function openProject(projectDir) {
  const paths = resolveProjectPaths(projectDir);
  await assertProjectExists(paths);
  const rawProject = await readProjectFiles(paths);
  const project = migrateProjectData(rawProject);

  await ensureProjectDirectories(paths);

  return buildProjectResult(paths, project);
}

async function saveProject(project) {
  const paths = project.paths || resolveProjectPaths(project.projectDir);
  const nextProject = migrateProjectData({
    meta: {
      ...project.meta,
      updatedAt: nowIso()
    },
    categories: project.categories || [],
    locations: project.locations || [],
    items: project.items || []
  });

  await backupProjectFiles(paths);
  await writeProjectFiles(paths, nextProject);

  return buildProjectResult(paths, nextProject);
}

async function saveProjectAs({ project, parentDir, projectName }) {
  const projectDir = path.join(parentDir, projectName);
  const paths = resolveProjectPaths(projectDir);
  const nextProject = migrateProjectData({
    meta: {
      ...(project.meta || {}),
      name: projectName,
      updatedAt: nowIso()
    },
    categories: structuredClone(project.categories || []),
    locations: structuredClone(project.locations || []),
    items: structuredClone(project.items || [])
  });

  await backupProjectFiles(paths);
  await writeProjectFiles(paths, nextProject);

  return buildProjectResult(paths, nextProject);
}

async function exportProjectBackup({ project, targetParentDir }) {
  const projectDir = project?.paths?.projectDir || project?.projectDir || '';
  const targetDir = targetParentDir || '';

  if (!projectDir) {
    throw new Error('缺少项目目录');
  }

  if (!targetDir) {
    throw new Error('缺少备份导出位置');
  }

  if (isSameOrInside(projectDir, targetDir)) {
    throw new Error('备份位置不能放在当前 data 目录里面');
  }

  await fs.mkdir(targetDir, { recursive: true });

  const projectName = sanitizeSegment(project?.meta?.name || '物品管理');
  const backupDir = await createUniqueDirectory(path.join(targetDir, `${projectName}-数据备份-${createBackupStamp()}`));

  await fs.cp(projectDir, backupDir, {
    recursive: true,
    errorOnExist: true
  });

  return {
    backupDir
  };
}

module.exports = {
  createProject,
  exportProjectBackup,
  openProject,
  saveProject,
  saveProjectAs,
  validateProject: validateProjectData
};
