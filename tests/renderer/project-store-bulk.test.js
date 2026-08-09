import { describe, expect, it } from 'vitest';

import { createProjectStore } from '../../src/renderer/store/project-store';

describe('project store bulk item updates', () => {
  it('updates only selected items and keeps unselected items unchanged', () => {
    const store = createProjectStore();
    store.getState().setProject({
      meta: { name: '库存' },
      categories: [
        { id: 'cat_clothes', name: '服装', level: 1, parentId: null },
        { id: 'cat_shoes', name: '鞋子', level: 2, parentId: 'cat_clothes' }
      ],
      locations: [
        { id: 'loc_home', name: '日常', level: 1, parentId: null },
        { id: 'loc_box', name: '鞋柜', level: 2, parentId: 'loc_home' }
      ],
      items: [
        { id: 'item_1', name: '板鞋', categoryId: 'cat_clothes', locationId: 'loc_home', tags: ['YF-001'] },
        { id: 'item_2', name: '键盘', categoryId: 'cat_clothes', locationId: 'loc_home', tags: [] }
      ]
    });

    const changedCount = store.getState().bulkUpdateItems(['item_1'], {
      categoryId: 'cat_shoes',
      locationId: 'loc_box',
      tagMode: 'append',
      tags: ['YF-009']
    });

    const [updatedItem, untouchedItem] = store.getState().currentProject.items;
    expect(changedCount).toBe(1);
    expect(updatedItem.categoryId).toBe('cat_shoes');
    expect(updatedItem.categoryPath).toBe('服装 / 鞋子');
    expect(updatedItem.locationId).toBe('loc_box');
    expect(updatedItem.locationPath).toBe('日常 / 鞋柜');
    expect(updatedItem.tags).toEqual(['YF-001', 'YF-009']);
    expect(untouchedItem.categoryId).toBe('cat_clothes');
    expect(untouchedItem.tags).toEqual([]);
  });
});
