function getBridge() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.webStorageDesktop || null;
}

function isDesktopBridgeAvailable() {
  return Boolean(getBridge());
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Request failed: ${response.status}`);
  }

  return response.json();
}

async function invokeOr(getter, fallback) {
  const bridge = getBridge();
  const fn = getter(bridge);

  if (!fn) {
    return typeof fallback === 'function' ? fallback() : fallback;
  }

  return fn();
}

export const desktopApi = {
  isDesktop: isDesktopBridgeAvailable,
  loadProject: () => requestJson('/api/project'),
  onAppCommand: (listener) => {
    const bridge = getBridge();

    if (!bridge?.app?.onCommand) {
      return () => {};
    }

    return bridge.app.onCommand(listener);
  },
  recentProjects: () => invokeOr((bridge) => bridge?.settings?.recentProjects, []),
  openDefaultProject: () =>
    invokeOr((bridge) => bridge?.project?.openDefault && (() => bridge.project.openDefault()), null),
  createProject: (payload) => invokeOr((bridge) => bridge?.project?.create && (() => bridge.project.create(payload)), null),
  openProject: (projectDir) => invokeOr((bridge) => bridge?.project?.open && (() => bridge.project.open(projectDir)), null),
  saveProject: (project) =>
    invokeOr((bridge) => bridge?.project?.save && (() => bridge.project.save(project)), () => requestJson('/api/project', {
      method: 'PUT',
      body: JSON.stringify(project)
    })),
  saveProjectAs: (payload) =>
    invokeOr((bridge) => bridge?.project?.saveAs && (() => bridge.project.saveAs(payload)), null),
  exportProjectBackup: (payload) =>
    invokeOr((bridge) => bridge?.project?.exportBackup && (() => bridge.project.exportBackup(payload)), null),
  validateProject: (project) =>
    invokeOr(
      (bridge) => bridge?.project?.validate && (() => bridge.project.validate(project)),
      { errors: [], warnings: [] }
    ),
  importProjectImage: (payload) =>
    invokeOr((bridge) => bridge?.project?.importImage && (() => bridge.project.importImage(payload)), null),
  organizeProjectImages: (project) =>
    invokeOr((bridge) => bridge?.project?.organizeImages && (() => bridge.project.organizeImages(project)), null),
  openProjectFolder: (projectDir) =>
    invokeOr((bridge) => bridge?.project?.openFolder && (() => bridge.project.openFolder(projectDir)), null),
  openProjectFile: (filePath) =>
    invokeOr((bridge) => bridge?.project?.openFile && (() => bridge.project.openFile(filePath)), null),
  inspectWorkbook: (filePath) =>
    invokeOr(
      (bridge) => bridge?.excel?.inspect && (() => bridge.excel.inspect(filePath)),
      { preview: { categories: 0, locations: 0, items: 0 }, data: { categories: [], locations: [], items: [] } }
    ),
  createProjectFromWorkbook: (payload) =>
    invokeOr((bridge) => bridge?.excel?.createProject && (() => bridge.excel.createProject(payload)), null),
  importWorkbook: (payload) =>
    invokeOr((bridge) => bridge?.excel?.importWorkbook && (() => bridge.excel.importWorkbook(payload)), null),
  exportWorkbook: (payload) =>
    invokeOr((bridge) => bridge?.excel?.exportWorkbook && (() => bridge.excel.exportWorkbook(payload)), null),
  pickDirectory: (options = {}) =>
    invokeOr((bridge) => bridge?.dialogs?.pickDirectory && (() => bridge.dialogs.pickDirectory(options)), null),
  pickFile: (options = {}) =>
    invokeOr((bridge) => bridge?.dialogs?.pickFile && (() => bridge.dialogs.pickFile(options)), null),
  saveFile: (options = {}) =>
    invokeOr((bridge) => bridge?.dialogs?.saveFile && (() => bridge.dialogs.saveFile(options)), null),
  removeRecentProject: (projectPath) =>
    invokeOr((bridge) => bridge?.settings?.removeRecentProject && (() => bridge.settings.removeRecentProject(projectPath)), []),
  createScanSession: () => requestJson('/api/scan-sessions', { method: 'POST' }),
  getScanSessionEventsUrl: (sessionId) => `/api/scan-sessions/${encodeURIComponent(sessionId)}/events`,
  getMobileScanUrl: (sessionId) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/scan/${encodeURIComponent(sessionId)}`;
  },
  uploadOssImage: (payload) => requestJson('/api/oss/images', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  lookupBarcode: (barcode) => requestJson(`/api/barcodes/${encodeURIComponent(barcode)}`),
  lookupBarcodeProduct: (barcode) => requestJson(`/api/barcodes/${encodeURIComponent(barcode)}/lookup`)
};
