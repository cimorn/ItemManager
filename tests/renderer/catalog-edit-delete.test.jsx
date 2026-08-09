import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import AppShell from '../../src/renderer/features/layout/AppShell';
import { createProjectStore } from '../../src/renderer/store/project-store';

const project = {
  meta: { name: '库存' },
  paths: { projectDir: 'C:/data' },
  categories: [
    { id: 'cat_clothes', name: '服装', level: 1, parentId: null },
    { id: 'cat_shoes', name: '鞋子', level: 2, parentId: 'cat_clothes' }
  ],
  locations: [
    { id: 'loc_home', name: '日常', level: 1, parentId: null },
    { id: 'loc_box', name: '鞋柜', level: 2, parentId: 'loc_home' }
  ],
  items: [{ id: 'item_1', name: '板鞋', categoryId: 'cat_shoes', locationId: 'loc_box' }]
};

function renderStoreBackedCatalog(mode = 'category') {
  const store = createProjectStore();
  store.getState().setProject(project);
  store.getState().setSelectedSection('catalog');
  store.getState().setSelectedCatalogMode(mode);

  function Harness() {
    const state = store();
    const visibleItems = state.currentProject.items;
    const selectedCatalogNodeId = state.selectedCatalogNodeIds[state.selectedCatalogMode];

    return (
      <AppShell
        project={state.currentProject}
        dirty={state.dirty}
        notice={state.notice}
        selectedSection={state.selectedSection}
        selectedCatalogMode={state.selectedCatalogMode}
        selectedCatalogNodeId={selectedCatalogNodeId}
        selectedItemId={state.selectedItemId}
        visibleItems={visibleItems}
        search={state.search}
        filters={state.itemFilters}
        onSelectSection={state.setSelectedSection}
        onSetCatalogMode={state.setSelectedCatalogMode}
        onSelectCatalogNode={state.selectCatalogNode}
        onAddCatalogRoot={state.addCatalogRoot}
        onAddCatalogSibling={state.addCatalogSibling}
        onAddCatalogChild={state.addCatalogChild}
        onDeleteCatalogNode={state.deleteCatalogNode}
        onUpdateCatalogNode={state.updateCatalogNode}
        onSearch={state.setSearch}
        onFilterChange={state.setItemFilters}
        onCreateItem={vi.fn()}
        onSelectItem={state.setSelectedItemId}
        onSaveItem={state.saveItem}
        onDeleteItem={state.deleteItem}
        onBulkUpdateItems={state.bulkUpdateItems}
        onImportItemImage={vi.fn()}
        onCreateProject={vi.fn()}
        onOpenProject={vi.fn()}
        onSaveProject={vi.fn()}
        onSaveProjectAs={vi.fn()}
        onImportWorkbook={vi.fn()}
        onExportWorkbook={vi.fn()}
        onExportDataBackup={vi.fn()}
        onDeleteTag={state.deleteTag}
        onDeleteTags={state.deleteTags}
        onRenameTag={state.renameTag}
        onUpdateTagPrefix={state.updateTagPrefix}
        desktopMode
      />
    );
  }

  render(<Harness />);
  return store;
}

describe('catalog editing and deletion', () => {
  it('expands a tree node when clicking a collapsed parent row', async () => {
    const user = userEvent.setup();
    renderStoreBackedCatalog('category');

    await user.click(screen.getByRole('treeitem', { name: '服装' }));

    expect(screen.getByRole('treeitem', { name: '鞋子' })).toBeInTheDocument();
  });

  it('edits and deletes category nodes from the catalog page', async () => {
    const user = userEvent.setup();
    const store = renderStoreBackedCatalog('category');

    await user.click(screen.getByRole('button', { name: '展开 服装' }));
    await user.click(screen.getByRole('treeitem', { name: '鞋子' }));
    await user.clear(screen.getByLabelText('名称'));
    await user.type(screen.getByLabelText('名称'), '运动鞋');
    await user.click(screen.getByRole('button', { name: '确定' }));

    expect(store.getState().currentProject.categories.find((entry) => entry.id === 'cat_shoes').name).toBe('运动鞋');
    expect(store.getState().currentProject.items[0].categoryPath).toBe('服装 / 运动鞋');

    await user.click(screen.getByRole('button', { name: '删除节点' }));
    expect(store.getState().currentProject.categories.some((entry) => entry.id === 'cat_shoes')).toBe(false);
    expect(store.getState().currentProject.items[0].categoryId).toBeNull();
  });

  it('edits and deletes location nodes from the catalog page', async () => {
    const user = userEvent.setup();
    const store = renderStoreBackedCatalog('location');

    await user.click(screen.getByRole('button', { name: '展开 日常' }));
    await user.click(screen.getByRole('treeitem', { name: '鞋柜' }));
    await user.clear(screen.getByLabelText('名称'));
    await user.type(screen.getByLabelText('名称'), '柜子');
    await user.click(screen.getByRole('button', { name: '确定' }));

    expect(store.getState().currentProject.locations.find((entry) => entry.id === 'loc_box').name).toBe('柜子');
    expect(store.getState().currentProject.items[0].locationPath).toBe('日常 / 柜子');

    await user.click(screen.getByRole('button', { name: '删除节点' }));
    expect(store.getState().currentProject.locations.some((entry) => entry.id === 'loc_box')).toBe(false);
    expect(store.getState().currentProject.items[0].locationId).toBeNull();
  });
});
