import CatalogWorkspace from '../catalog/CatalogWorkspace';
import ItemsGalleryPage from '../items/ItemsGalleryPage';
import TagManager from '../tags/TagManager';
import Toolbar from './Toolbar';

const CATALOG_CONTEXT_TITLES = {
  category: '分类管理',
  location: '位置管理',
  tag: '标签管理'
};

export default function AppShell({
  project,
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
  onReorderCatalogNode,
  onSearch,
  onBrandClick,
  onFilterChange,
  onCreateItem,
  onRequireEdit,
  onSelectItem,
  onSaveItem,
  onDeleteItem,
  onBulkUpdateItems,
  onSaveProject,
  onDeleteTag,
  onDeleteTags,
  onRenameTag,
  onUpdateTagPrefix,
  interactionDisabled = false,
  catalogSaveOnConfirm = false,
  canManagePrivacy = false
}) {
  const visibleSection = selectedSection === 'catalog' ? 'catalog' : 'items';
  const selectedModeEntries = selectedCatalogMode === 'location' ? project.locations : project.categories;
  const toolbarContextActions = <div className="toolbar-context-title">{CATALOG_CONTEXT_TITLES[selectedCatalogMode] || '目录管理'}</div>;

  return (
    <div className="app-shell" inert={interactionDisabled}>
      <Toolbar
        selectedSection={visibleSection}
        selectedCatalogMode={selectedCatalogMode}
        search={search}
        contextActions={visibleSection === 'catalog' ? toolbarContextActions : null}
        onSelectSection={onSelectSection}
        onSetCatalogMode={onSetCatalogMode}
        onSearch={onSearch}
        onBrandClick={onBrandClick}
        onBackToItems={() => onSelectSection?.('items')}
        onSaveProject={onSaveProject}
      />

      <div className={`app-body ${visibleSection === 'items' ? 'app-body--items' : 'app-body--plain'}`}>
        <main className="app-main">
          {visibleSection === 'items' ? (
            <ItemsGalleryPage
              canManagePrivacy={canManagePrivacy}
              allItems={project.items}
              items={visibleItems}
              categories={project.categories}
              locations={project.locations}
              tagPrefixes={project.meta?.tagPrefixes || {}}
              filters={filters}
              selectedItemId={selectedItemId}
              onFilterChange={onFilterChange}
              onCreateItem={onCreateItem}
              onRequireEdit={onRequireEdit}
              onSelectItem={onSelectItem}
              onSaveItem={onSaveItem}
              onDeleteItem={onDeleteItem}
              onBulkUpdateItems={onBulkUpdateItems}
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
                  onRequireEdit={onRequireEdit}
                  showHeader={false}
                />
              ) : (
                <CatalogWorkspace
                  canManagePrivacy={canManagePrivacy}
                  mode={selectedCatalogMode}
                  entries={selectedModeEntries}
                  selectedId={selectedCatalogNodeId}
                  onSelect={onSelectCatalogNode}
                  onAddRoot={onAddCatalogRoot}
                  onAddSibling={onAddCatalogSibling}
                  onAddChild={onAddCatalogChild}
                  onDelete={onDeleteCatalogNode}
                  onUpdate={onUpdateCatalogNode}
                  onReorder={onReorderCatalogNode}
                  onSaveOrder={onSaveProject}
                  saveOnConfirm={catalogSaveOnConfirm}
                  onRequireEdit={onRequireEdit}
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
