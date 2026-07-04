import CatalogWorkspace from '../catalog/CatalogWorkspace';
import ItemsGalleryPage from '../items/ItemsGalleryPage';
import Sidebar from '../navigation/Sidebar';
import TagManager from '../tags/TagManager';
import Toolbar from './Toolbar';

const CATALOG_CONTEXT_TITLES = {
  category: '分类管理',
  location: '位置管理',
  tag: '标签管理'
};

export default function AppShell({
  project,
  dirty,
  notice,
  selectedSection,
  selectedCatalogMode,
  selectedCatalogNodeId,
  selectedItemId,
  visibleItems,
  search = '',
  filters = {
    mainCategoryId: '',
    subCategoryId: '',
    locationId: ''
  },
  onSelectSection,
  onSetCatalogMode,
  onSelectCatalogNode,
  onAddCatalogRoot,
  onAddCatalogSibling,
  onAddCatalogChild,
  onDeleteCatalogNode,
  onUpdateCatalogNode,
  onSearch,
  onFilterChange,
  onCreateItem,
  onSelectItem,
  onSaveItem,
  onDeleteItem,
  onBulkUpdateItems,
  onImportItemImage,
  onCreateProject,
  onOpenProject,
  onSaveProject,
  onSaveProjectAs,
  onImportWorkbook,
  onExportWorkbook,
  onExportDataBackup,
  onDeleteTag,
  onDeleteTags,
  onRenameTag,
  onUpdateTagPrefix,
  desktopMode = true
}) {
  const visibleSection = selectedSection === 'catalog' ? 'catalog' : 'items';
  const selectedModeEntries = selectedCatalogMode === 'location' ? project.locations : project.categories;
  const toolbarContextActions = <div className="toolbar-context-title">{CATALOG_CONTEXT_TITLES[selectedCatalogMode] || '目录管理'}</div>;

  return (
    <div className="app-shell">
      <Toolbar
        dirty={dirty}
        notice={notice}
        selectedSection={visibleSection}
        selectedCatalogMode={selectedCatalogMode}
        search={search}
        contextActions={visibleSection === 'catalog' ? toolbarContextActions : null}
        onSelectSection={onSelectSection}
        onSetCatalogMode={onSetCatalogMode}
        onSearch={onSearch}
        onBackToItems={() => onSelectSection?.('items')}
        onCreateProject={onCreateProject}
        onOpenProject={onOpenProject}
        onSaveProject={onSaveProject}
        onSaveProjectAs={onSaveProjectAs}
        onImportWorkbook={onImportWorkbook}
        onExportWorkbook={onExportWorkbook}
        onExportDataBackup={onExportDataBackup}
        desktopMode={desktopMode}
      />

      <div className={`app-body ${visibleSection === 'items' ? 'app-body--items' : 'app-body--plain'}`}>
        {visibleSection === 'items' ? (
          <Sidebar
            categories={project.categories}
            activeMainCategoryId={filters.mainCategoryId}
            onSelectMainCategory={(mainCategoryId) =>
              onFilterChange?.({
                mainCategoryId
              })
            }
          />
        ) : null}

        <main className="app-main">
          {visibleSection === 'items' ? (
            <ItemsGalleryPage
              allItems={project.items}
              items={visibleItems}
              categories={project.categories}
              locations={project.locations}
              tagPrefixes={project.meta?.tagPrefixes || {}}
              projectDir={project.paths?.projectDir}
              filters={filters}
              selectedItemId={selectedItemId}
              onFilterChange={onFilterChange}
              onCreateItem={onCreateItem}
              onSelectItem={onSelectItem}
              onSaveItem={onSaveItem}
              onDeleteItem={onDeleteItem}
              onBulkUpdateItems={onBulkUpdateItems}
              onImportImage={onImportItemImage}
            />
          ) : null}

          {visibleSection === 'catalog' ? (
            <div className="catalog-stack">
              {selectedCatalogMode === 'tag' ? (
                <TagManager
                  items={project.items}
                  categories={project.categories}
                  locations={project.locations}
                  tagPrefixes={project.meta?.tagPrefixes || {}}
                  onDeleteTag={onDeleteTag}
                  onDeleteTags={onDeleteTags}
                  onRenameTag={onRenameTag}
                  onUpdateTagPrefix={onUpdateTagPrefix}
                  showHeader={false}
                />
              ) : (
                <CatalogWorkspace
                  mode={selectedCatalogMode}
                  entries={selectedModeEntries}
                  selectedId={selectedCatalogNodeId}
                  onSelect={onSelectCatalogNode}
                  onAddRoot={onAddCatalogRoot}
                  onAddSibling={onAddCatalogSibling}
                  onAddChild={onAddCatalogChild}
                  onDelete={onDeleteCatalogNode}
                  onUpdate={onUpdateCatalogNode}
                  showHeaderActions={false}
                />
              )}
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
