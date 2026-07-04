import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import AppShell from '../../src/renderer/features/layout/AppShell';

const project = {
  meta: { name: '测试项目', tagPrefixes: { cat_clothes: 'YF' } },
  paths: { projectDir: 'C:/data/test' },
  categories: [
    { id: 'cat_clothes', name: '服装', level: 1, parentId: null },
    { id: 'cat_shoes', name: '鞋子', level: 2, parentId: 'cat_clothes' }
  ],
  locations: [
    { id: 'loc_home', name: '日常', level: 1, parentId: null },
    { id: 'loc_box', name: '鞋柜', level: 2, parentId: 'loc_home' }
  ],
  items: []
};

function renderShell(overrides = {}) {
  const props = {
    project,
    dirty: false,
    notice: '',
    selectedSection: 'catalog',
    selectedCatalogMode: 'category',
    selectedCatalogNodeId: 'cat_clothes',
    selectedItemId: null,
    visibleItems: [],
    search: '',
    filters: { mainCategoryId: '', subCategoryId: '', locationId: '', tag: '' },
    onSelectSection: vi.fn(),
    onSetCatalogMode: vi.fn(),
    onSelectCatalogNode: vi.fn(),
    onAddCatalogRoot: vi.fn(),
    onAddCatalogSibling: vi.fn(),
    onAddCatalogChild: vi.fn(),
    onDeleteCatalogNode: vi.fn(),
    onUpdateCatalogNode: vi.fn(),
    onSearch: vi.fn(),
    onFilterChange: vi.fn(),
    onCreateItem: vi.fn(),
    onSelectItem: vi.fn(),
    onSaveItem: vi.fn(),
    onDeleteItem: vi.fn(),
    onBulkUpdateItems: vi.fn(),
    onImportItemImage: vi.fn(),
    onCreateProject: vi.fn(),
    onOpenProject: vi.fn(),
    onSaveProject: vi.fn(),
    onSaveProjectAs: vi.fn(),
    onImportWorkbook: vi.fn(),
    onExportWorkbook: vi.fn(),
    onDeleteTag: vi.fn(),
    onDeleteTags: vi.fn(),
    onRenameTag: vi.fn(),
    onUpdateTagPrefix: vi.fn(),
    desktopMode: true,
    ...overrides
  };

  render(<AppShell {...props} />);
  return props;
}

describe('AppShell contextual toolbar', () => {
  it('keeps catalog actions inside the directory panel and replaces file/save with back', async () => {
    const user = userEvent.setup();
    const props = renderShell();

    expect(screen.queryByRole('button', { name: '物品' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '分类' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '位置' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '标签' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '文件' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '保存' })).not.toBeInTheDocument();

    const toolbarContext = screen.getByLabelText('当前页面操作');
    expect(within(toolbarContext).getByText('分类管理')).toBeInTheDocument();
    expect(within(toolbarContext).queryByRole('button', { name: '新增顶级' })).not.toBeInTheDocument();
    expect(within(toolbarContext).queryByRole('button', { name: '新增同级' })).not.toBeInTheDocument();
    expect(within(toolbarContext).queryByRole('button', { name: '新增下级' })).not.toBeInTheDocument();
    expect(within(toolbarContext).queryByRole('button', { name: '删除节点' })).not.toBeInTheDocument();

    const directoryActions = screen.getByLabelText('分类目录操作');
    expect(within(directoryActions).getByRole('button', { name: '新增顶级' })).toBeInTheDocument();
    expect(within(directoryActions).getByRole('button', { name: '新增同级' })).toBeInTheDocument();
    expect(within(directoryActions).getByRole('button', { name: '新增下级' })).toBeInTheDocument();
    expect(within(directoryActions).getByRole('button', { name: '删除节点' })).toBeInTheDocument();

    await user.click(within(directoryActions).getByRole('button', { name: '新增下级' }));
    expect(props.onAddCatalogChild).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('名称'));
    await user.type(screen.getByLabelText('名称'), '帽子');
    await user.click(screen.getByRole('button', { name: '确定' }));

    expect(props.onAddCatalogChild).toHaveBeenCalledWith('category', '帽子');

    await user.click(screen.getByRole('button', { name: '返回' }));
    expect(props.onSelectSection).toHaveBeenCalledWith('items');
  });

  it('uses the same back-only top toolbar behavior on the tag page', () => {
    renderShell({
      selectedCatalogMode: 'tag',
      selectedCatalogNodeId: null
    });

    expect(screen.queryByRole('button', { name: '物品' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '文件' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '保存' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '返回' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '新增顶级' })).not.toBeInTheDocument();
    expect(screen.getByText('标签管理')).toBeInTheDocument();
  });
});
