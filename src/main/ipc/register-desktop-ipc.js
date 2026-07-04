async function rememberProject(settingsService, project) {
  await settingsService.recordRecentProject({
    name: project.meta?.name || '未命名项目',
    path: project.paths?.projectDir || ''
  });
  await settingsService.setLastOpenedProject(project.paths?.projectDir || null);
  return project;
}

function registerDesktopIpc({ ipcMain, dialog, services, shell }) {
  ipcMain.handle('project:create', async (_event, payload) =>
    rememberProject(services.settings, await services.project.createProject(payload))
  );
  ipcMain.handle('project:open-default', async () => {
    if (!services.defaultProjectDir) {
      return null;
    }

    try {
      return await rememberProject(services.settings, await services.project.openProject(services.defaultProjectDir));
    } catch (error) {
      if (error?.code === 'PROJECT_NOT_FOUND') {
        return null;
      }

      throw error;
    }
  });
  ipcMain.handle('project:open', async (_event, projectDir) =>
    rememberProject(services.settings, await services.project.openProject(projectDir))
  );
  ipcMain.handle('project:save', async (_event, project) =>
    rememberProject(services.settings, await services.project.saveProject(project))
  );
  ipcMain.handle('project:save-as', async (_event, payload) =>
    rememberProject(services.settings, await services.project.saveProjectAs(payload))
  );
  ipcMain.handle('project:export-backup', (_event, payload) => services.project.exportProjectBackup(payload));
  ipcMain.handle('project:validate', (_event, project) => services.project.validateProject(project));
  ipcMain.handle('project:open-folder', (_event, projectDir) => shell.openPath(projectDir));
  ipcMain.handle('project:open-file', (_event, filePath) => shell.openPath(filePath));
  ipcMain.handle('project:import-image', (_event, payload) => services.images.importProjectImage(payload));
  ipcMain.handle('project:organize-images', async (_event, project) => {
    const result = await services.images.organizeProjectImages(project);
    const savedProject = await rememberProject(services.settings, await services.project.saveProject(result.project));

    return {
      ...result,
      project: savedProject
    };
  });

  ipcMain.handle('excel:inspect', (_event, filePath) => services.excel.inspectWorkbookFile(filePath));
  ipcMain.handle('excel:create-project', async (_event, payload) =>
    rememberProject(services.settings, await services.excel.createProjectFromWorkbook(payload))
  );
  ipcMain.handle('excel:import', async (_event, payload) =>
    rememberProject(services.settings, await services.excel.importIntoProject(payload))
  );
  ipcMain.handle('excel:export', async (_event, payload) => {
    const result = await services.excel.exportWorkbook(payload);

    if (result.project) {
      await rememberProject(services.settings, result.project);
    }

    return result;
  });

  ipcMain.handle('settings:recent-projects', () => services.settings.getRecentProjects());
  ipcMain.handle('settings:remove-recent-project', (_event, projectPath) =>
    services.settings.removeRecentProject(projectPath)
  );
  ipcMain.handle('dialog:pick-directory', async (_event, options = {}) => {
    const result = await dialog.showOpenDialog({
      title: options.title || '选择目录',
      defaultPath: options.defaultPath,
      properties: options.createDirectory === false ? ['openDirectory'] : ['openDirectory', 'createDirectory']
    });

    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('dialog:pick-file', async (_event, options = {}) => {
    const result = await dialog.showOpenDialog({
      title: options.title || '选择文件',
      defaultPath: options.defaultPath,
      filters: options.filters,
      properties: ['openFile']
    });

    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('dialog:save-file', async (_event, options = {}) => {
    const result = await dialog.showSaveDialog({
      title: options.title || '保存文件',
      defaultPath: options.defaultPath,
      filters: options.filters
    });

    return result.canceled ? null : result.filePath;
  });
}

module.exports = { registerDesktopIpc };
