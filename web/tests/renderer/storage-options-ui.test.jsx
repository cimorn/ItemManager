import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ItemEditorModal from '../../src/renderer/features/items/ItemEditorModal';
import ItemGalleryCard from '../../src/renderer/features/items/ItemGalleryCard';
import ItemFilterChips from '../../src/renderer/features/items/ItemFilterChips';
import { buildFilterGroups, buildItemCardView } from '../../src/renderer/features/items/item-gallery-selectors';
import CatalogWorkspace from '../../src/renderer/features/catalog/CatalogWorkspace';
import NodeEditorPane from '../../src/renderer/features/catalog/NodeEditorPane';
import { ImageAccessProvider } from '../../src/renderer/features/web/ImageAccessContext';

const categories = [
  { id: 'public', name: '日常', level: 1, parentId: null },
  { id: 'look', name: 'Look', level: 1, parentId: null },
  { id: 'private', name: '私人', level: 1, parentId: null, isPrivate: true },
  { id: 'child', name: '子类', level: 2, parentId: 'public' }
];
const locations = [
  { id: 'room', name: '房间', level: 1, parentId: null },
  { id: 'cabinet', name: '柜子', level: 2, parentId: 'room' },
  { id: 'box', name: '盒子', level: 3, parentId: 'cabinet' },
  { id: 'other', name: '另一个房间', level: 1, parentId: null },
  { id: 'secret', name: '私人柜', level: 1, parentId: null, isPrivate: true }
];
const item = { id: 'item', name: '书', categoryId: 'public', locationId: 'box', tags: [] };
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function editor(initialItem = item, extra = {}) {
  const onSave = vi.fn();
  const props = { open: true, item: initialItem, categories, locations, onSave, ...extra };
  const view = render(<ImageAccessProvider api={{}}><ItemEditorModal {...props} /></ImageAccessProvider>);
  return { user: userEvent.setup(), onSave, ...view };
}
const locationRow = number => within(screen.getByRole('group', { name: `存放位置 ${number}` }));

describe('compact NAS item controls', () => {
  it('keeps existing field values under the renamed specification and style controls', async () => {
    const { user, onSave } = editor({ ...item, notes: '白色·S', specification: '印花·镂空', quantity: '1' });
    expect(screen.getByLabelText('规格')).toHaveValue('白色·S');
    expect(screen.getByLabelText('规格')).toHaveAttribute('placeholder', '白色·S');
    expect(screen.getByLabelText('款式')).toHaveValue('印花·镂空');
    expect(screen.getByLabelText('款式')).toHaveAttribute('placeholder', '印花·镂空');
    expect(screen.getByLabelText('数量')).toHaveValue('1');
    await user.clear(screen.getByLabelText('规格'));
    await user.type(screen.getByLabelText('规格'), '黑色·M');
    await user.clear(screen.getByLabelText('款式'));
    await user.type(screen.getByLabelText('款式'), '纯色');
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ notes: '黑色·M', specification: '纯色', quantity: '1' }));
  });

  it('offers one ordinary file selector with privacy and packaging controls and puts tags last', async () => {
    const { container, user, onSave } = editor();
    expect(screen.queryByRole('button', { name: '手机拍照' })).not.toBeInTheDocument();
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(1);
    expect(container.querySelector('input[type="file"]')).not.toHaveAttribute('capture');
    const controls = screen.getByRole('button', { name: '选择图片' }).parentElement;
    expect(within(controls).getByRole('checkbox', { name: '隐私区' })).not.toBeChecked();
    await user.click(within(controls).getByRole('checkbox', { name: '包装' }));
    expect(container.querySelector('.item-editor-modal__form').lastElementChild).toHaveAttribute('aria-label', '物品标签');
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ isPackaged: true, isPrivate: false }));
  });

  it('allows packaging to be removed and shows packaging on the gallery card', async () => {
    const { user, onSave, unmount } = editor({ ...item, isPackaged: true });
    await user.click(screen.getByRole('checkbox', { name: '包装' }));
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ isPackaged: false }));
    unmount();
    render(<ItemGalleryCard item={buildItemCardView({ ...item, isPackaged: true, locationPaths: ['房间 / 柜子 / 盒子', '另一个房间'] }, '')} />);
    expect(screen.getByText('有包装')).toBeInTheDocument();
    expect(screen.getByText('房间 · 柜子 · 盒子；另一个房间')).toBeInTheDocument();
  });

  it('keeps accessible filter groups while labeling the root choices directly', () => {
    render(<ItemFilterChips groups={buildFilterGroups(categories, locations, {}, [])} filters={{}} onChange={vi.fn()} />);
    const category = screen.getByRole('group', { name: '分类筛选' });
    const location = screen.getByRole('group', { name: '位置筛选' });
    expect(within(category).getByLabelText('一级分类筛选').selectedOptions[0]).toHaveTextContent('分类');
    expect(within(location).getByLabelText('一级位置筛选').selectedOptions[0]).toHaveTextContent('位置');
    expect(category.querySelector('.item-hierarchy-filter__label')).toBeNull();
    expect(location.querySelector('.item-hierarchy-filter__label')).toBeNull();
  });
});

describe('multiple item locations', () => {
  it('starts from the legacy primary, clears descendants, and saves unique ordered locations', async () => {
    const { user, onSave } = editor();
    expect(locationRow(1).getByLabelText('三级位置')).toHaveValue('box');
    await user.click(screen.getByRole('button', { name: '添加位置' }));
    expect(screen.getByRole('button', { name: '添加位置' })).toBeDisabled();
    await user.selectOptions(locationRow(2).getByLabelText('一级位置'), 'other');
    await user.click(screen.getByRole('button', { name: '添加位置' }));
    await user.selectOptions(locationRow(3).getByLabelText('一级位置'), 'other');
    await user.selectOptions(locationRow(1).getByLabelText('一级位置'), 'other');
    expect(locationRow(1).getByLabelText('二级位置')).toHaveValue('');
    expect(locationRow(1).getByLabelText('三级位置')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ locationIds: ['other'], locationId: 'other' }));
  });

  it('preserves existing order and removes every assigned location explicitly', async () => {
    const { user, onSave } = editor({ ...item, locationIds: ['other', 'box'] });
    expect(locationRow(1).getByLabelText('一级位置')).toHaveValue('other');
    expect(locationRow(2).getByLabelText('三级位置')).toHaveValue('box');
    await user.click(screen.getByRole('button', { name: '移除位置 1' }));
    await user.click(screen.getByRole('button', { name: '移除位置 1' }));
    expect(locationRow(1).getByLabelText('一级位置')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ locationIds: [], locationId: null }));
  });

  it('limits location rows to 32', () => {
    editor({ ...item, locationIds: Array.from({ length: 32 }, (_, index) => `location_${index}`) });
    expect(screen.getAllByRole('group', { name: /^存放位置 / })).toHaveLength(32);
    expect(screen.getByRole('button', { name: '添加位置' })).toBeDisabled();
  });
});

describe('item inherited privacy', () => {
  it.each(['look', 'private'])('protects category %s while keeping the own flag editable after leaving', async categoryId => {
    const { user, onSave } = editor({ ...item, categoryId });
    expect(screen.getByRole('checkbox', { name: '隐私区' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '隐私区' })).toBeDisabled();
    expect(screen.getByText('所选分类或位置属于隐私区')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('主分类'), 'public');
    expect(screen.getByRole('checkbox', { name: '隐私区' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: '隐私区' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ isPrivate: false }));
  });

  it('inherits a secondary location and retains an explicitly marked flag until unmarked', async () => {
    const { user } = editor({ ...item, locationIds: ['box', 'secret'], isPrivate: true });
    expect(screen.getByRole('checkbox', { name: '隐私区' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '移除位置 2' }));
    expect(screen.getByRole('checkbox', { name: '隐私区' })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: '隐私区' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: '隐私区' }));
    expect(screen.getByRole('checkbox', { name: '隐私区' })).not.toBeChecked();
  });
});

describe('catalog privacy drafts', () => {
  it.each(['category', 'location'])('forwards %s private create metadata', async mode => {
    const onAddRoot = vi.fn(), user = userEvent.setup();
    render(<CatalogWorkspace mode={mode} entries={mode === 'category' ? categories : locations} onAddRoot={onAddRoot} />);
    await user.click(screen.getByRole('button', { name: '新增顶级', exact: true }));
    await user.type(screen.getByLabelText('名称'), '收藏');
    await user.click(screen.getByRole('checkbox', { name: '隐私区' }));
    await user.click(screen.getByRole('button', { name: '确定', exact: true }));
    expect(onAddRoot).toHaveBeenCalledWith(mode, '收藏', { isPrivate: true });
  });

  it.each(['category', 'location'])('saves and cancels %s privacy-only edits, and resets on metadata refresh', async mode => {
    const onUpdate = vi.fn(), user = userEvent.setup(), node = categories[0];
    const view = render(<NodeEditorPane mode={mode} entries={categories} node={node} onUpdate={onUpdate} />);
    await user.click(screen.getByRole('checkbox', { name: '隐私区' }));
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.getByRole('checkbox', { name: '隐私区' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: '确定' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: '隐私区' }));
    await user.click(screen.getByRole('button', { name: '确定' }));
    expect(onUpdate).toHaveBeenCalledWith(mode, node.id, { name: node.name, isPrivate: true });
    view.rerender(<NodeEditorPane mode={mode} entries={categories} node={{ ...node, isPrivate: true }} onUpdate={onUpdate} />);
    expect(screen.getByRole('button', { name: '确定' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: '隐私区' }));
    await user.click(screen.getByRole('button', { name: '确定' }));
    expect(onUpdate).toHaveBeenLastCalledWith(mode, node.id, { name: node.name, isPrivate: false });
  });

  it('derives Look privacy from the draft name without persisting it as an explicit flag', async () => {
    const onConfirmCreate = vi.fn(), user = userEvent.setup();
    render(<NodeEditorPane mode="category" entries={categories.filter(node => node.id !== 'look')} node={{ id: 'draft', name: '', parentId: null, level: 1 }} isCreate onConfirmCreate={onConfirmCreate} />);
    await user.type(screen.getByLabelText('名称'), 'Look');
    expect(screen.getByRole('checkbox', { name: '隐私区' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '隐私区' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '确定' }));
    expect(onConfirmCreate).toHaveBeenCalledWith({ name: 'Look', parentId: null, isPrivate: false });
    await user.clear(screen.getByLabelText('名称'));
    await user.type(screen.getByLabelText('名称'), '公开');
    expect(screen.getByRole('checkbox', { name: '隐私区' })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: '隐私区' })).not.toBeChecked();
  });

  it.each(['category', 'location'])('derives %s parent privacy while moving and allows an own flag outside it', async mode => {
    const user = userEvent.setup(), node = categories[3];
    render(<NodeEditorPane mode={mode} entries={categories} node={node} onUpdate={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText('父级'), 'private');
    expect(screen.getByRole('checkbox', { name: '隐私区' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '隐私区' })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('父级'), 'public');
    expect(screen.getByRole('checkbox', { name: '隐私区' })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: '隐私区' })).not.toBeChecked();
  });
});
