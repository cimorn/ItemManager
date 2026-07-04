import { describe, expect, it } from 'vitest';

import { applyItemGalleryFilters } from '../../src/renderer/features/items/item-gallery-selectors';

const categories = [{ id: 'cat_clothes', name: '服装', level: 1, parentId: null }];

const locations = [
  { id: 'loc_325', name: '325', level: 1, parentId: null },
  { id: 'loc_desk', name: '桌下', level: 2, parentId: 'loc_325' },
  { id: 'loc_box', name: '收纳盒', level: 3, parentId: 'loc_desk' },
  { id: 'loc_daily', name: '日常', level: 1, parentId: null }
];

const items = [
  { id: 'item_root', name: '根位置物品', categoryId: 'cat_clothes', locationId: 'loc_325', tags: [] },
  { id: 'item_child', name: '桌下物品', categoryId: 'cat_clothes', locationId: 'loc_desk', tags: [] },
  { id: 'item_grandchild', name: '盒内物品', categoryId: 'cat_clothes', locationId: 'loc_box', tags: [] },
  { id: 'item_daily', name: '日常物品', categoryId: 'cat_clothes', locationId: 'loc_daily', tags: [] }
];

describe('applyItemGalleryFilters', () => {
  it('filters by the selected location and its descendants', () => {
    expect(applyItemGalleryFilters(items, categories, locations, { locationId: 'loc_325' }).map((item) => item.id)).toEqual([
      'item_root',
      'item_child',
      'item_grandchild'
    ]);

    expect(applyItemGalleryFilters(items, categories, locations, { locationId: 'loc_desk' }).map((item) => item.id)).toEqual([
      'item_child',
      'item_grandchild'
    ]);

    expect(applyItemGalleryFilters(items, categories, locations, { locationId: 'loc_box' }).map((item) => item.id)).toEqual(['item_grandchild']);
  });
});
