import { useState } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ItemsGalleryPage from '../../src/renderer/features/items/ItemsGalleryPage';
import ItemEditorModal from '../../src/renderer/features/items/ItemEditorModal';
import { sortItemGalleryItems } from '../../src/renderer/features/items/item-gallery-selectors';

const access = vi.hoisted(() => ({ current: null }));
vi.mock('../../src/renderer/features/web/ImageAccessContext', () => ({
  useImageAccess: () => access.current,
  useImagePreview: () => '',
  useImagePreviewState: () => ({ url: '', status: 'none' })
}));
const categories = [{ id: 'ordinary', name: '数码', level: 1, parentId: null }, { id: 'private', name: 'Look', level: 1, parentId: null }];
const locations = [{ id: 'home', name: '家里', level: 1, parentId: null }, { id: 'office', name: '公司', level: 1, parentId: null }];
const source = {
  id: 'saved-item', name: '耳机', notes: '备用', brand: '品牌', specification: '型号', quantity: '2',
  barcode: 'CODE', categoryId: 'ordinary', locationId: 'home', locationIds: ['home', 'office'],
  imagePath: 'original-image', tags: ['SM-001'], isPackaged: true, isPrivate: false,
  createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-02-03T00:00:00.000Z', feishuRecordId: 'remote-record'
};
function setup(item = source) {
  const onCreateItem = vi.fn().mockResolvedValue(undefined);
  const onSaveItem = vi.fn().mockResolvedValue(undefined);
  render(<ItemsGalleryPage allItems={[item]} items={[item]} categories={categories} locations={locations}
    onCreateItem={onCreateItem} onSaveItem={onSaveItem} />);
  return { user: userEvent.setup(), onCreateItem, onSaveItem };
}
async function openCopy(user) {
  await user.click(screen.getByRole('button', { name: source.name, exact: true }));
  await user.click(screen.getByRole('button', { name: '复制新增', exact: true }));
}
beforeEach(() => {
  access.current = { copy: vi.fn().mockResolvedValue({ imageId: 'independent-image' }), upload: vi.fn().mockResolvedValue({ imageId: 'replacement-image' }) };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('copy a saved item into a new draft', () => {
  it('creates a fresh record with all normal details and independently copies its photo only on Save', async () => {
    const { user, onCreateItem, onSaveItem } = setup();
    await openCopy(user);
    expect(screen.getByRole('heading', { name: '复制新增' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除物品' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('名称')).toHaveValue(source.name);
    expect(screen.getByLabelText('包装')).toBeChecked();
    expect(access.current.copy).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText('名称'));
    await user.type(screen.getByLabelText('名称'), '另一副耳机');
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(onCreateItem).toHaveBeenCalledTimes(1));
    const draft = onCreateItem.mock.calls[0][0];
    expect(draft).toMatchObject({ name: '另一副耳机', notes: source.notes, brand: source.brand, specification: source.specification,
      quantity: source.quantity, barcode: source.barcode, categoryId: source.categoryId, locationIds: ['home', 'office'],
      tags: ['SM-001'], isPackaged: true, imagePath: 'independent-image' });
    for (const key of ['id', 'createdAt', 'updatedAt', 'feishuRecordId']) expect(draft).not.toHaveProperty(key);
    expect(access.current.copy).toHaveBeenCalledExactlyOnceWith('original-image');
    expect(onSaveItem).not.toHaveBeenCalled();
    expect(source.name).toBe('耳机');
  });

  it('canceling a copy performs no image or record writes', async () => {
    const { user, onCreateItem, onSaveItem } = setup();
    await openCopy(user);
    await user.click(screen.getByRole('button', { name: '取消', exact: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(access.current.copy).not.toHaveBeenCalled();
    expect(access.current.upload).not.toHaveBeenCalled();
    expect(onCreateItem).not.toHaveBeenCalled();
    expect(onSaveItem).not.toHaveBeenCalled();
  });

  it('can copy an item without an image without requesting a photo copy', async () => {
    const { user, onCreateItem } = setup({ ...source, imagePath: '' });
    await openCopy(user);
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(onCreateItem).toHaveBeenCalledWith(expect.objectContaining({ imagePath: '' })));
    expect(access.current.copy).not.toHaveBeenCalled();
  });

  it('does not reveal privacy controls in an ordinary locked copy editor', () => {
    render(<ItemEditorModal open mode="copy" item={source} categories={categories.filter(category => category.id !== 'private')}
      locations={locations} canManagePrivacy={false} />);
    expect(screen.queryByLabelText('隐私区')).not.toBeInTheDocument();
    expect(screen.getByLabelText('包装')).toBeChecked();
  });

  it('copies the saved version rather than silently carrying unsaved edits across', async () => {
    const { user, onSaveItem } = setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: source.name, exact: true }));
    await user.clear(screen.getByLabelText('规格'));
    await user.type(screen.getByLabelText('规格'), '尚未保存');
    await user.click(screen.getByRole('button', { name: '复制新增', exact: true }));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('规格')).toHaveValue(source.notes);
    expect(onSaveItem).not.toHaveBeenCalled();
  });

  it('uses a replacement file without copying the original photo', async () => {
    const { user, onCreateItem } = setup();
    await openCopy(user);
    const file = new File(['new-photo'], 'new.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('从相册选择图片'), file);
    expect(access.current.upload).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(onCreateItem).toHaveBeenCalledTimes(1));
    expect(access.current.copy).not.toHaveBeenCalled();
    expect(access.current.upload).toHaveBeenCalledExactlyOnceWith(file);
    expect(onCreateItem.mock.calls[0][0].imagePath).toBe('replacement-image');
  });

  it('reuses a successful photo copy when the record save fails and is retried', async () => {
    const { user, onCreateItem } = setup();
    onCreateItem.mockRejectedValueOnce(new Error('保存失败，请重试'));
    await openCopy(user);
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('保存失败，请重试');
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(onCreateItem).toHaveBeenCalledTimes(2));
    expect(access.current.copy).toHaveBeenCalledTimes(1);
    expect(onCreateItem.mock.calls.map(([draft]) => draft.imagePath)).toEqual(['independent-image', 'independent-image']);
  });

  it('retains the draft after a failed photo copy and retries without creating a record first', async () => {
    const { user, onCreateItem } = setup();
    access.current.copy.mockRejectedValueOnce(new Error('图片复制失败'));
    await openCopy(user);
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('图片复制失败');
    expect(onCreateItem).not.toHaveBeenCalled();
    expect(screen.getByLabelText('名称')).toHaveValue(source.name);
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(onCreateItem).toHaveBeenCalledTimes(1));
    expect(access.current.copy).toHaveBeenCalledTimes(2);
  });

  it.each([{ categoryId: 'private', isPrivate: false }, { categoryId: 'ordinary', isPrivate: true }])('keeps a private source private after changing its copied category (%j)', async (privacy) => {
    const { user, onCreateItem } = setup({ ...source, ...privacy });
    await openCopy(user);
    await user.selectOptions(screen.getByLabelText('主分类'), 'ordinary');
    expect(screen.getByLabelText('隐私区')).toBeChecked();
    expect(screen.getByLabelText('隐私区')).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(onCreateItem).toHaveBeenCalledWith(expect.objectContaining({ isPrivate: true })));
  });

  it('allows an unlocked user to explicitly change the copied item privacy after choosing ordinary catalogs', async () => {
    const { user, onCreateItem } = setup({ ...source, categoryId: 'private' });
    await openCopy(user);
    await user.selectOptions(screen.getByLabelText('主分类'), 'ordinary');
    await user.click(screen.getByLabelText('隐私区'));
    await user.click(screen.getByRole('button', { name: '保存', exact: true }));
    await waitFor(() => expect(onCreateItem).toHaveBeenCalledWith(expect.objectContaining({ isPrivate: false })));
  });

  it('does not finish saving a stale photo copy after the editor closes', async () => {
    let resolve;
    access.current.copy.mockReturnValue(new Promise(done => { resolve = done; }));
    const onSave = vi.fn();
    const props = { mode: 'copy', item: source, categories, locations, onSave };
    const view = render(<ItemEditorModal open {...props} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '保存', exact: true }));
    view.rerender(<ItemEditorModal open={false} {...props} />);
    await act(async () => resolve({ imageId: 'late-image' }));
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('visible gallery sorting', () => {
  const items = [
    { id: 'legacy-a' }, { id: 'old', createdAt: '2025-01-01', updatedAt: '2026-03-01' },
    { id: 'new', createdAt: '2026-02-01' }, { id: 'same', createdAt: '2026-02-01', updatedAt: 'invalid' },
    { id: 'legacy-b', createdAt: 'invalid', updatedAt: '' }
  ];
  it('sorts newly created items first, keeping ties and unknown legacy dates in original order without mutating input', () => {
    expect(sortItemGalleryItems(items, 'created-desc').map(item => item.id)).toEqual(['new', 'same', 'old', 'legacy-a', 'legacy-b']);
    expect(items.map(item => item.id)).toEqual(['legacy-a', 'old', 'new', 'same', 'legacy-b']);
    expect(sortItemGalleryItems(items, '').map(item => item.id)).toEqual(['old', 'new', 'same', 'legacy-a', 'legacy-b']);
    expect(sortItemGalleryItems(items).map(item => item.id)).toEqual(['old', 'new', 'same', 'legacy-a', 'legacy-b']);
  });
  it('sorts recently modified items first, using creation date when the modification date is absent or invalid', () => {
    expect(sortItemGalleryItems(items, 'updated-desc').map(item => item.id)).toEqual(['old', 'new', 'same', 'legacy-a', 'legacy-b']);
  });
  it('changes only the visible item order and reports a sort filter patch', async () => {
    const onFilterChange = vi.fn();
    const visible = [{ ...source, id: 'first', name: '旧物品', imagePath: '', createdAt: '2025-01-01', updatedAt: '2026-04-01' },
      { ...source, id: 'second', name: '新物品', imagePath: '', createdAt: '2026-01-01', updatedAt: '2026-02-01' }];
    function Harness() {
      const [filters, setFilters] = useState({ mainCategoryId: 'ordinary', locationId: 'home', sort: '' });
      return <ItemsGalleryPage allItems={[...visible, { ...source, id: 'hidden', name: '隐藏物品', createdAt: '2027-01-01' }]} items={visible}
        categories={categories} locations={locations} filters={filters} onFilterChange={patch => { onFilterChange(patch); setFilters(current => ({ ...current, ...patch })); }} />;
    }
    const view = render(<Harness />);
    const order = () => [...view.container.querySelectorAll('.item-gallery-card')].map(card => card.getAttribute('aria-label'));
    const user = userEvent.setup();
    expect(screen.getByLabelText('物品排序')).toHaveDisplayValue('最近更新');
    expect(order()).toEqual(['旧物品', '新物品']);
    await user.selectOptions(screen.getByLabelText('物品排序'), 'created-desc');
    expect(order()).toEqual(['新物品', '旧物品']);
    expect(onFilterChange).toHaveBeenLastCalledWith({ sort: 'created-desc' });
    expect(screen.getByLabelText('一级分类筛选')).toHaveValue('ordinary');
    expect(screen.getByLabelText('一级位置筛选')).toHaveValue('home');
    expect(screen.queryByRole('button', { name: '隐藏物品' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('物品排序'), 'updated-desc');
    expect(order()).toEqual(['旧物品', '新物品']);
  });
});
