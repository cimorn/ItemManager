import { startTransition, useEffect, useEffectEvent, useMemo, useState } from 'react';

import ProjectDialog from './features/home/ProjectDialog';
import ProjectHome from './features/home/ProjectHome';
import ExportDialog from './features/import-export/ExportDialog';
import ImportDialog from './features/import-export/ImportDialog';
import { applyItemGalleryFilters } from './features/items/item-gallery-selectors';
import AppShell from './features/layout/AppShell';
import { desktopApi } from './lib/desktop-api';
import { buildNodePath } from './lib/project-data';
import { useProjectStore } from './store/project-store';

function closeAllDialogs() {
  return {
    create: false,
    saveAs: false,
    importHome: false,
    importCurrent: false,
    exportWorkbook: false
  };
}

function getProjectParentDir(project) {
  const projectDir = project?.paths?.projectDir || '';
  const parts = projectDir.split(/[\\/]/).filter(Boolean);
  return parts.length > 1 ? projectDir.slice(0, projectDir.lastIndexOf(parts[parts.length - 1]) - 1) : '';
}

function getExportDefaultPath(project) {
  const projectName = project?.meta?.name || '库存导出';
  const exportsDir = project?.paths?.exportsDir || project?.paths?.projectDir || '';
  const normalized = exportsDir.replace(/[\\/]+$/, '');
  return normalized ? `${normalized}/${projectName}.xlsx` : `${projectName}.xlsx`;
}

function getBackupDefaultDir(project) {
  return getProjectParentDir(project) || project?.paths?.projectDir || '';
}

export default function App() {
  const currentProject = useProjectStore((state) => state.currentProject);
  const recentProjects = useProjectStore((state) => state.recentProjects);
  const dirty = useProjectStore((state) => state.dirty);
  const notice = useProjectStore((state) => state.notice);
  const search = useProjectStore((state) => state.search);
  const itemFilters = useProjectStore((state) => state.itemFilters);
  const selectedSection = useProjectStore((state) => state.selectedSection);
  const selectedItemId = useProjectStore((state) => state.selectedItemId);
  const selectedCatalogMode = useProjectStore((state) => state.selectedCatalogMode);
  const selectedCatalogNodeIds = useProjectStore((state) => state.selectedCatalogNodeIds);

  const setNotice = useProjectStore((state) => state.setNotice);
  const setRecentProjects = useProjectStore((state) => state.setRecentProjects);
  const setProject = useProjectStore((state) => state.setProject);
  const markSaved = useProjectStore((state) => state.markSaved);
  const setSearch = useProjectStore((state) => state.setSearch);
  const setItemFilters = useProjectStore((state) => state.setItemFilters);
  const setSelectedSection = useProjectStore((state) => state.setSelectedSection);
  const setSelectedCatalogMode = useProjectStore((state) => state.setSelectedCatalogMode);
  const selectCatalogNode = useProjectStore((state) => state.selectCatalogNode);
  const createItemFromDraft = useProjectStore((state) => state.createItemFromDraft);
  const saveItem = useProjectStore((state) => state.saveItem);
  const deleteItem = useProjectStore((state) => state.deleteItem);
  const bulkUpdateItems = useProjectStore((state) => state.bulkUpdateItems);
  const deleteTag = useProjectStore((state) => state.deleteTag);
  const deleteTags = useProjectStore((state) => state.deleteTags);
  const renameTag = useProjectStore((state) => state.renameTag);
  const updateTagPrefix = useProjectStore((state) => state.updateTagPrefix);
  const addCatalogRoot = useProjectStore((state) => state.addCatalogRoot);
  const addCatalogSibling = useProjectStore((state) => state.addCatalogSibling);
  const addCatalogChild = useProjectStore((state) => state.addCatalogChild);
  const updateCatalogNode = useProjectStore((state) => state.updateCatalogNode);
  const deleteCatalogNode = useProjectStore((state) => state.deleteCatalogNode);
  const setSelectedItemId = useProjectStore((state) => state.setSelectedItemId);

  const desktopMode = desktopApi.isDesktop();
  const [dialogs, setDialogs] = useState(closeAllDialogs);
  const [busy, setBusy] = useState(false);
  const [initializing, setInitializing] = useState(!desktopMode);

  const selectedCatalogNodeId = selectedCatalogNodeIds[selectedCatalogMode];
  const visibleItems = useMemo(() => {
    if (!currentProject) {
      return [];
    }

    return applyItemGalleryFilters(
      currentProject.items || [],
      currentProject.categories || [],
      currentProject.locations || [],
      itemFilters,
      search
    );
  }, [currentProject, itemFilters, search]);

  const saveAsInitialValues = useMemo(
    () => ({
      projectName: currentProject?.meta?.name || '',
      parentDir: getProjectParentDir(currentProject)
    }),
    [currentProject]
  );
  const importHomeInitialValues = useMemo(
    () => ({
      projectName: '',
      parentDir: recentProjects[0]?.path ? getProjectParentDir({ paths: { projectDir: recentProjects[0].path } }) : ''
    }),
    [recentProjects]
  );
  const exportInitialValues = useMemo(() => ({ filePath: getExportDefaultPath(currentProject) }), [currentProject]);

  async function refreshRecentProjects() {
    const nextRecentProjects = await desktopApi.recentProjects();
    setRecentProjects(nextRecentProjects || []);
  }

  useEffect(() => {
    if (desktopMode) {
      let cancelled = false;

      desktopApi
        .openDefaultProject()
        .then((project) => {
          if (cancelled) {
            return null;
          }

          if (project) {
            startTransition(() => {
              setProject(project);
            });
            markSaved();
            setNotice('已打开本地 data 项目');
          }

          return refreshRecentProjects();
        })
        .catch((error) => {
          if (!cancelled) {
            setNotice(error?.message || '本地 data 项目读取失败');
          }
        });

      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;

    desktopApi
      .loadProject()
      .then((project) => {
        if (cancelled) {
          return;
        }

        startTransition(() => {
          setProject(project);
        });
        markSaved();
      })
      .catch((error) => {
        if (!cancelled) {
          setNotice(error?.message || '网页项目读取失败');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setInitializing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [desktopMode, markSaved, setNotice, setProject, setRecentProjects]);

  const applyProject = useEffectEvent((project, message) => {
    if (!project) {
      return;
    }

    startTransition(() => {
      setProject(project);
    });
    markSaved();
    if (message) {
      setNotice(message);
    }
    if (desktopMode) {
      refreshRecentProjects().catch(() => {});
    }
  });

  const handleAppCommand = useEffectEvent((command) => {
    switch (command) {
      case 'project:new':
        setDialogs((state) => ({ ...closeAllDialogs(), create: true }));
        break;
      case 'project:open':
        void handleOpenProjectPicker();
        break;
      case 'project:save':
        void handleSaveProject();
        break;
      case 'project:save-as':
        setDialogs((state) => ({ ...state, saveAs: true }));
        break;
      case 'project:import-home':
        setDialogs((state) => ({ ...closeAllDialogs(), importHome: true }));
        break;
      case 'project:import-current':
        if (currentProject) {
          setDialogs((state) => ({ ...state, importCurrent: true }));
        }
        break;
      case 'project:export':
        if (currentProject) {
          setDialogs((state) => ({ ...state, exportWorkbook: true }));
        }
        break;
      case 'project:export-backup':
        if (currentProject) {
          void handleExportDataBackup();
        }
        break;
      default:
        break;
    }
  });

  useEffect(() => desktopApi.onAppCommand(handleAppCommand), [handleAppCommand]);

  async function runWithBusy(task) {
    try {
      setBusy(true);
      return await task();
    } catch (error) {
      setNotice(error?.message || '操作失败');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenProjectPicker() {
    const projectDir = await desktopApi.pickDirectory({
      title: '选择项目目录',
      createDirectory: false
    });

    if (!projectDir) {
      return;
    }

    await runWithBusy(async () => {
      const project = await desktopApi.openProject(projectDir);
      applyProject(project, '已打开项目');
    });
  }

  async function handleOpenRecent(projectPath) {
    try {
      setBusy(true);
      const project = await desktopApi.openProject(projectPath);
      applyProject(project, '已打开最近项目');
    } catch (error) {
      if (error?.message === '项目不存在' || error?.code === 'PROJECT_NOT_FOUND') {
        const nextRecentProjects = await desktopApi.removeRecentProject(projectPath);
        setRecentProjects(nextRecentProjects || []);
        setNotice('最近项目已失效，已从列表移除');
        return;
      }

      setNotice(error?.message || '操作失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateProject(payload) {
    await runWithBusy(async () => {
      const project = await desktopApi.createProject(payload);
      applyProject(project, '新项目已创建');
      setDialogs(closeAllDialogs());
    });
  }

  async function handleSaveProject() {
    if (!currentProject) {
      return;
    }

    await runWithBusy(async () => {
      const validation = await desktopApi.validateProject(currentProject);
      if (validation?.errors?.length) {
        setNotice(validation.errors[0].message || '请先修正目录或物品数据');
        return;
      }

      const project = await desktopApi.saveProject(currentProject);
      applyProject(project, validation?.warnings?.[0]?.message || '项目已保存');
    });
  }

  async function handleSaveProjectAs(payload) {
    if (!currentProject) {
      return;
    }

    await runWithBusy(async () => {
      const project = await desktopApi.saveProjectAs({
        project: currentProject,
        ...payload
      });
      applyProject(project, '项目已另存为');
      setDialogs(closeAllDialogs());
    });
  }

  async function handleCreateProjectFromWorkbook(payload) {
    await runWithBusy(async () => {
      const project = await desktopApi.createProjectFromWorkbook(payload);
      applyProject(project, 'Excel 已生成本地项目');
      setDialogs(closeAllDialogs());
    });
  }

  async function handleImportWorkbook(payload) {
    if (!currentProject) {
      return;
    }

    await runWithBusy(async () => {
      const project = await desktopApi.importWorkbook({
        currentProject,
        ...payload
      });
      applyProject(project, 'Excel 数据已导入');
      setDialogs(closeAllDialogs());
    });
  }

  async function handleExportWorkbook(payload) {
    if (!currentProject) {
      return;
    }

    await runWithBusy(async () => {
      const result = await desktopApi.exportWorkbook({
        project: currentProject,
        ...payload
      });
      applyProject(result?.project || currentProject, '数据已导出');
      setDialogs(closeAllDialogs());
    });
  }

  async function handleExportDataBackup() {
    if (!currentProject) {
      return;
    }

    const targetParentDir = await desktopApi.pickDirectory({
      title: '选择数据备份导出位置',
      defaultPath: getBackupDefaultDir(currentProject)
    });

    if (!targetParentDir) {
      return;
    }

    await runWithBusy(async () => {
      const savedProject = await desktopApi.saveProject(currentProject);
      const result = await desktopApi.exportProjectBackup({
        project: savedProject,
        targetParentDir
      });

      applyProject(savedProject, result?.backupDir ? `数据备份已导出：${result.backupDir}` : '数据备份已导出');
    });
  }

  async function handleOrganizeImages() {
    if (!currentProject) {
      return;
    }

    await runWithBusy(async () => {
      const result = await desktopApi.organizeProjectImages(currentProject);
      if (!result?.project) {
        setNotice('当前环境不支持整理图片');
        return;
      }

      const skippedText = result.skippedCount ? `，跳过 ${result.skippedCount} 个` : '';
      const message = result.movedCount
        ? `已整理 ${result.movedCount} 张图片${skippedText}`
        : `没有需要整理的旧图片${skippedText}`;

      applyProject(result.project, message);
    });
  }

  function handleBulkUpdateItems(itemIds, patch) {
    const changedCount = bulkUpdateItems(itemIds, patch);

    if (!changedCount) {
      setNotice('请先选择要批量修改的物品');
      return;
    }

    setNotice(`已批量修改 ${changedCount} 个物品`);
  }

  async function handleImportItemImage(item) {
    if (!currentProject?.paths?.projectDir) {
      return null;
    }

    const sourceFilePath = await desktopApi.pickFile({
      title: '选择图片文件',
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }]
    });

    if (!sourceFilePath) {
      return null;
    }

    const categoryPath = buildNodePath(currentProject.categories, item.categoryId);
    if (!categoryPath) {
      setNotice('上传图片前请先选择分类');
      return null;
    }

    try {
      setBusy(true);
      const result = await desktopApi.importProjectImage({
        projectDir: currentProject.paths.projectDir,
        categoryPath,
        sourceFilePath
      });

      if (result?.relativePath) {
        setNotice(`图片已保存到 ${result.relativePath}`);
      }

      return result;
    } catch (error) {
      const message = error?.message || '图片导入失败';
      setNotice(message);
      throw error;
    } finally {
      setBusy(false);
    }
  }

  function renderDialogs() {
    return (
      <>
        <ProjectDialog
          open={dialogs.create}
          mode="create"
          title="创建新项目"
          confirmLabel="创建项目"
          onClose={() => setDialogs(closeAllDialogs())}
          onConfirm={handleCreateProject}
          onPickDirectory={() => desktopApi.pickDirectory({ title: '选择项目保存位置' })}
        />
        <ProjectDialog
          open={dialogs.saveAs}
          mode="saveAs"
          title="另存为"
          confirmLabel="保存副本"
          initialValues={saveAsInitialValues}
          onClose={() => setDialogs((state) => ({ ...state, saveAs: false }))}
          onConfirm={handleSaveProjectAs}
          onPickDirectory={() => desktopApi.pickDirectory({ title: '选择另存为位置' })}
        />
        <ImportDialog
          open={dialogs.importHome}
          kind="create"
          title="从 Excel 创建项目"
          confirmLabel="创建项目"
          initialValues={importHomeInitialValues}
          onClose={() => setDialogs((state) => ({ ...state, importHome: false }))}
          onConfirm={handleCreateProjectFromWorkbook}
          onPickFile={() =>
            desktopApi.pickFile({
              title: '选择 Excel 文件',
              filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }]
            })
          }
          onPickDirectory={() => desktopApi.pickDirectory({ title: '选择项目保存位置' })}
        />
        <ImportDialog
          open={dialogs.importCurrent}
          kind="import"
          title="导入 Excel"
          confirmLabel="开始导入"
          initialValues={{ mode: 'merge' }}
          onClose={() => setDialogs((state) => ({ ...state, importCurrent: false }))}
          onConfirm={handleImportWorkbook}
          onPickFile={() =>
            desktopApi.pickFile({
              title: '选择 Excel 文件',
              filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }]
            })
          }
        />
        <ExportDialog
          open={dialogs.exportWorkbook}
          title="导出 Excel"
          confirmLabel="确认导出"
          initialValues={exportInitialValues}
          onClose={() => setDialogs((state) => ({ ...state, exportWorkbook: false }))}
          onConfirm={handleExportWorkbook}
          onPickSavePath={() =>
            desktopApi.saveFile({
              title: '选择导出位置',
              defaultPath: exportInitialValues.filePath,
              filters: [{ name: 'Excel', extensions: ['xlsx'] }]
            })
          }
        />
      </>
    );
  }

  if (initializing) {
    return (
      <main className="home-shell">
        <section className="hero-card">
          <div className="hero-copy">
            <h1>正在连接网页库存</h1>
          <p>正在读取物品管理数据。</p>
          </div>
        </section>
      </main>
    );
  }

  if (!currentProject) {
    return (
      <>
        <ProjectHome
          recentProjects={recentProjects}
          onCreate={() => setDialogs((state) => ({ ...closeAllDialogs(), create: true }))}
          onOpenPicker={handleOpenProjectPicker}
          onImport={() => setDialogs((state) => ({ ...closeAllDialogs(), importHome: true }))}
          onOpenRecent={handleOpenRecent}
        />
        {renderDialogs()}
      </>
    );
  }

  return (
    <>
      <AppShell
        project={currentProject}
        dirty={dirty}
        notice={busy ? '正在处理，请稍候…' : notice}
        selectedSection={selectedSection}
        selectedCatalogMode={selectedCatalogMode}
        selectedCatalogNodeId={selectedCatalogNodeId}
        selectedItemId={selectedItemId}
        visibleItems={visibleItems}
        search={search}
        filters={itemFilters}
        onSelectSection={setSelectedSection}
        onSetCatalogMode={setSelectedCatalogMode}
        onSelectCatalogNode={selectCatalogNode}
        onAddCatalogRoot={addCatalogRoot}
        onAddCatalogSibling={addCatalogSibling}
        onAddCatalogChild={addCatalogChild}
        onDeleteCatalogNode={deleteCatalogNode}
        onUpdateCatalogNode={updateCatalogNode}
        onSearch={setSearch}
        onFilterChange={setItemFilters}
        onCreateItem={createItemFromDraft}
        onSelectItem={setSelectedItemId}
        onSaveItem={saveItem}
        onDeleteItem={deleteItem}
        onBulkUpdateItems={handleBulkUpdateItems}
        onImportItemImage={handleImportItemImage}
        onOpenProjectFolder={(projectDir) => desktopApi.openProjectFolder(projectDir)}
        onOpenProjectFile={(filePath) => desktopApi.openProjectFile(filePath)}
        onOrganizeImages={handleOrganizeImages}
        onCreateProject={() => setDialogs((state) => ({ ...closeAllDialogs(), create: true }))}
        onOpenProject={handleOpenProjectPicker}
        onSaveProject={handleSaveProject}
        onSaveProjectAs={() => setDialogs((state) => ({ ...state, saveAs: true }))}
        onImportWorkbook={() => setDialogs((state) => ({ ...state, importCurrent: true }))}
        onExportWorkbook={() => setDialogs((state) => ({ ...state, exportWorkbook: true }))}
        onExportDataBackup={handleExportDataBackup}
        onDeleteTag={deleteTag}
        onDeleteTags={deleteTags}
        onRenameTag={renameTag}
        onUpdateTagPrefix={updateTagPrefix}
        desktopMode={desktopMode}
      />
      {renderDialogs()}
    </>
  );
}
