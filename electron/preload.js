const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('webStorageDesktop', {
  app: {
    onCommand: (listener) => {
      const wrapped = (_event, command) => listener(command);
      ipcRenderer.on('app:command', wrapped);

      return () => {
        ipcRenderer.removeListener('app:command', wrapped);
      };
    }
  },
  project: {
    create: (payload) => ipcRenderer.invoke('project:create', payload),
    openDefault: () => ipcRenderer.invoke('project:open-default'),
    open: (projectDir) => ipcRenderer.invoke('project:open', projectDir),
    save: (project) => ipcRenderer.invoke('project:save', project),
    saveAs: (payload) => ipcRenderer.invoke('project:save-as', payload),
    exportBackup: (payload) => ipcRenderer.invoke('project:export-backup', payload),
    validate: (project) => ipcRenderer.invoke('project:validate', project),
    importImage: (payload) => ipcRenderer.invoke('project:import-image', payload),
    organizeImages: (project) => ipcRenderer.invoke('project:organize-images', project),
    openFolder: (projectDir) => ipcRenderer.invoke('project:open-folder', projectDir),
    openFile: (filePath) => ipcRenderer.invoke('project:open-file', filePath)
  },
  excel: {
    inspect: (filePath) => ipcRenderer.invoke('excel:inspect', filePath),
    createProject: (payload) => ipcRenderer.invoke('excel:create-project', payload),
    importWorkbook: (payload) => ipcRenderer.invoke('excel:import', payload),
    exportWorkbook: (payload) => ipcRenderer.invoke('excel:export', payload)
  },
  dialogs: {
    pickDirectory: (options) => ipcRenderer.invoke('dialog:pick-directory', options),
    pickFile: (options) => ipcRenderer.invoke('dialog:pick-file', options),
    saveFile: (options) => ipcRenderer.invoke('dialog:save-file', options)
  },
  settings: {
    recentProjects: () => ipcRenderer.invoke('settings:recent-projects'),
    removeRecentProject: (projectPath) => ipcRenderer.invoke('settings:remove-recent-project', projectPath)
  }
});
