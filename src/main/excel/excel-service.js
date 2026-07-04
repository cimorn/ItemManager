const fs = require('node:fs/promises');
const path = require('node:path');

const XLSX = require('xlsx');

const { buildWorkbook } = require('./export-workbook');
const { inspectWorkbookFile } = require('./import-workbook');
const { mergeProjectData } = require('./merge-project-data');
const { nowIso } = require('../project/project-schema');

function appendHistoryEntry(history = [], entry) {
  return [entry, ...history].slice(0, 10);
}

async function writeBackupSnapshot(project) {
  if (!project?.paths?.exportsDir) {
    return null;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(project.paths.exportsDir, 'backups', stamp);

  await fs.mkdir(backupDir, { recursive: true });
  await fs.writeFile(
    path.join(backupDir, 'project.json'),
    `${JSON.stringify(
      {
        meta: project.meta || {},
        categories: project.categories || [],
        locations: project.locations || [],
        items: project.items || []
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  return backupDir;
}

function attachImportMetadata(project, filePath, mode) {
  return {
    ...project,
    meta: {
      ...project.meta,
      updatedAt: nowIso(),
      recentImports: appendHistoryEntry(project.meta?.recentImports, {
        filePath,
        mode,
        importedAt: nowIso()
      })
    }
  };
}

function attachExportMetadata(project, filePath) {
  return {
    ...project,
    meta: {
      ...project.meta,
      updatedAt: nowIso(),
      recentExports: appendHistoryEntry(project.meta?.recentExports, {
        filePath,
        exportedAt: nowIso()
      })
    }
  };
}

function createExcelService({ projectService }) {
  return {
    inspectWorkbookFile,
    async createProjectFromWorkbook({ filePath, parentDir, projectName }) {
      const inspected = await inspectWorkbookFile(filePath);
      const createdProject = await projectService.createProject({ parentDir, projectName });
      const importedProject = attachImportMetadata(
        {
          ...createdProject,
          meta: {
            ...createdProject.meta,
            name: projectName
          },
          categories: inspected.data.categories,
          locations: inspected.data.locations,
          items: inspected.data.items
        },
        filePath,
        'replace'
      );

      return projectService.saveProject(importedProject);
    },
    async importIntoProject({ currentProject, filePath, mode }) {
      await writeBackupSnapshot(currentProject);

      const inspected = await inspectWorkbookFile(filePath);
      const mergedProject = mergeProjectData({
        currentProject,
        importedProject: inspected.data,
        mode
      });
      const nextProject = attachImportMetadata(
        {
          ...currentProject,
          categories: mergedProject.categories,
          locations: mergedProject.locations,
          items: mergedProject.items
        },
        filePath,
        mode
      );

      return projectService.saveProject(nextProject);
    },
    async exportWorkbook({ project, filePath }) {
      const workbook = buildWorkbook(project);
      XLSX.writeFile(workbook, filePath);

      if (!project?.paths?.projectDir) {
        return { filePath, project };
      }

      const savedProject = await projectService.saveProject(attachExportMetadata(project, filePath));
      return { filePath, project: savedProject };
    }
  };
}

module.exports = { createExcelService };
