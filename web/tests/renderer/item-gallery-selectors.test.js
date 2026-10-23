import { describe, expect, it } from 'vitest';

import { applyItemGalleryFilters, buildItemCardView } from '../../src/renderer/features/items/item-gallery-selectors';

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
  it('intersects packaging with category, location, tag and search; legacy absence is unpackaged', () => {
    const source = [
      { id: 'yes', name: '相机', categoryId: 'cat_clothes', locationId: 'loc_box', tags: ['A'], isPackaged: true },
      { id: 'no', name: '相机', categoryId: 'cat_clothes', locationId: 'loc_box', tags: ['A'], isPackaged: false },
      { id: 'legacy', name: '相机', categoryId: 'cat_clothes', locationId: 'loc_box', tags: ['A'] },
      { id: 'elsewhere', name: '相机', locationId: 'loc_daily', tags: ['A'], isPackaged: true }
    ];
    const filters = { mainCategoryId: 'cat_clothes', locationId: 'loc_325', tag: 'A', packaging: 'packaged' };
    expect(applyItemGalleryFilters(source, categories, locations, filters, '相机').map(x => x.id)).toEqual(['yes']);
    expect(applyItemGalleryFilters(source, categories, locations, { ...filters, packaging: 'unpackaged' }, '相机').map(x => x.id)).toEqual(['no', 'legacy']);
    expect(applyItemGalleryFilters(source, categories, locations, filters, '不存在')).toEqual([]);
  });
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


describe('card quantity display', () => {
  it.each(['1', 1, ' 1 '])('hides a single item (%j) without changing its saved quantity', quantity => {
    const card = buildItemCardView({ name: 'T恤', brand: '品牌', specification: '印花·镂空', quantity });
    expect(card.metaLine).toBe('品牌 · 印花·镂空');
    expect(card.quantity).toBe(quantity);
  });
  it.each(['2', '12', '1件', ''])('keeps other quantity text (%j)', quantity => {
    expect(buildItemCardView({ brand: '品牌', quantity }).metaLine).toBe(quantity ? '品牌 · ' + quantity : '品牌');
  });
});
