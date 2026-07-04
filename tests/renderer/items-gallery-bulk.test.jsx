import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ItemsGalleryPage from '../../src/renderer/features/items/ItemsGalleryPage';

const categories = [
  { id: 'cat_clothes', name: '服装', level: 1, parentId: null },
  { id: 'cat_shoes', name: '鞋子', level: 2, parentId: 'cat_clothes' }
];

const locations = [
  { id: 'loc_home', name: '日常', level: 1, parentId: null },
  { id: 'loc_box', name: '鞋柜', level: 2, parentId: 'loc_home' }
];

const items = [
  {
    id: 'item_1',
    name: '板鞋',
    brand: 'Champion',
    categoryId: 'cat_clothes',
    locationId: 'loc_home',
    tags: ['YF-001']
  },
  {
    id: 'item_2',
    name: '键盘',
    brand: 'Apple',
    categoryId: 'cat_clothes',
    locationId: 'loc_home',
    tags: []
  }
];

describe('ItemsGalleryPage bulk editing', () => {
  it('selects visible cards and submits one batch edit payload', async () => {
    const user = userEvent.setup();
    const onBulkUpdateItems = vi.fn();
    const onOpenEdit = vi.fn();

    render(
      <ItemsGalleryPage
        allItems={items}
        items={items}
        categories={categories}
        locations={locations}
        filters={{ mainCategoryId: '', subCategoryId: '', locationId: '', tag: '' }}
        onBulkUpdateItems={onBulkUpdateItems}
        onOpenEdit={onOpenEdit}
      />
    );

    await user.click(screen.getByRole('button', { name: '批量修改' }));
    await user.click(screen.getByRole('button', { name: '板鞋' }));

    expect(onOpenEdit).not.toHaveBeenCalled();
    expect(screen.getByText('已选 1 个')).toBeInTheDocument();

    const panel = screen.getByLabelText('批量修改面板');
    await user.selectOptions(within(panel).getByLabelText('批量分类'), 'cat_shoes');
    await user.selectOptions(within(panel).getByLabelText('批量位置'), 'loc_box');
    await user.type(within(panel).getByLabelText('批量标签'), 'YF-009');
    await user.click(within(panel).getByRole('button', { name: '应用批量修改' }));

    expect(onBulkUpdateItems).toHaveBeenCalledWith(['item_1'], {
      categoryId: 'cat_shoes',
      locationId: 'loc_box',
      tagMode: 'append',
      tags: ['YF-009']
    });
  });
});
