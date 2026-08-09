import { useState } from 'react';

export default function Toolbar({
  selectedSection,
  selectedCatalogMode,
  search = '',
  contextActions = null,
  onSelectSection,
  onSetCatalogMode,
  onSearch,
  onBackToItems,
  onCreateProject,
  onOpenProject,
  onSaveProject,
  onSaveProjectAs,
  onImportWorkbook,
  onExportWorkbook,
  onExportDataBackup,
  desktopMode = true
}) {
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const contextualMode = selectedSection === 'catalog';

  function handleFileAction(action) {
    setFileMenuOpen(false);
    action?.();
  }

  function openCatalogMode(mode) {
    onSelectSection?.('catalog');
    onSetCatalogMode?.(mode);
  }

  return (
    <header className={`app-toolbar ${contextualMode ? 'app-toolbar--context' : ''}`}>
      <div className="toolbar-brand">
        <div className="brand-badge brand-badge--sidebar-width" aria-hidden="true">
          物品管理
        </div>
      </div>

      <label className="toolbar-search toolbar-search--between-sides" aria-label="搜索物品">
        <input value={search} onChange={(event) => onSearch?.(event.target.value)} placeholder="搜索名称、备注、品牌" />
      </label>

      {contextualMode ? (
        <>
          <div className="toolbar-context" aria-label="当前页面操作">
            {contextActions}
          </div>
          <div className="toolbar-return-slot">
            <button className="secondary-button toolbar-button--uniform toolbar-return-button" type="button" onClick={() => onBackToItems?.()}>
              返回
            </button>
          </div>
        </>
      ) : (
        <>
          <nav className="toolbar-nav" aria-label="主导航">
            <button
              className={`toolbar-nav__button toolbar-button--uniform ${selectedSection === 'items' ? 'is-active' : ''}`}
              type="button"
              onClick={() => onSelectSection?.('items')}
            >
              物品
            </button>
            <button
              className={`toolbar-nav__button toolbar-button--uniform ${
                selectedSection === 'catalog' && selectedCatalogMode === 'category' ? 'is-active' : ''
              }`}
              type="button"
              onClick={() => openCatalogMode('category')}
            >
              分类
            </button>
            <button
              className={`toolbar-nav__button toolbar-button--uniform ${
                selectedSection === 'catalog' && selectedCatalogMode === 'location' ? 'is-active' : ''
              }`}
              type="button"
              onClick={() => openCatalogMode('location')}
            >
              位置
            </button>
            <button
              className={`toolbar-nav__button toolbar-button--uniform ${
                selectedSection === 'catalog' && selectedCatalogMode === 'tag' ? 'is-active' : ''
              }`}
              type="button"
              onClick={() => openCatalogMode('tag')}
            >
              标签
            </button>
          </nav>

          <div className="toolbar-actions">
            {desktopMode ? (
              <div className="toolbar-menu">
                <button
                  className="secondary-button toolbar-menu__trigger toolbar-button--uniform"
                  type="button"
                  aria-expanded={fileMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setFileMenuOpen((open) => !open)}
                >
                  文件
                </button>
                {fileMenuOpen ? (
                  <div className="toolbar-menu__panel" role="menu" aria-label="项目文件操作">
                    <button className="toolbar-menu__item" role="menuitem" type="button" onClick={() => handleFileAction(onCreateProject)}>
                      新建项目
                    </button>
                    <button className="toolbar-menu__item" role="menuitem" type="button" onClick={() => handleFileAction(onOpenProject)}>
                      打开项目
                    </button>
                    <button className="toolbar-menu__item" role="menuitem" type="button" onClick={() => handleFileAction(onSaveProjectAs)}>
                      另存为
                    </button>
                    <button className="toolbar-menu__item" role="menuitem" type="button" onClick={() => handleFileAction(onImportWorkbook)}>
                      导入 Excel
                    </button>
                    <button className="toolbar-menu__item" role="menuitem" type="button" onClick={() => handleFileAction(onExportWorkbook)}>
                      导出 Excel
                    </button>
                    <button className="toolbar-menu__item" role="menuitem" type="button" onClick={() => handleFileAction(onExportDataBackup)}>
                      导出数据备份
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="toolbar-save-slot">
            <button className="primary-button toolbar-button--uniform" type="button" onClick={onSaveProject}>
              保存
            </button>
          </div>
        </>
      )}
    </header>
  );
}
