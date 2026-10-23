import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProjectStore } from '../../src/renderer/store/project-store';

const BEFORE = '2026-10-20T08:00:00.000Z';
const NOW = '2026-10-22T12:00:00.000Z';

function fixture() {
  return {
    meta: {},
    categories: [{ id: 'cat', name: 'Tools', level: 1, parentId: null }],
    locations: [{ id: 'home', name: 'Home', level: 1, parentId: null }, { id: 'office', name: 'Office', level: 1, parentId: null }],
    items: [
      { id: 'one', name: 'One', categoryId: 'cat', locationId: 'home', tags: ['A-001'], createdAt: BEFORE, updatedAt: BEFORE },
      { id: 'two', name: 'Two', categoryId: 'cat', locationId: 'office', tags: [] }
    ]
  };
}
function setup() {
  vi.useFakeTimers(); vi.setSystemTime(new Date(NOW));
  const store = createProjectStore(); store.getState().setProject(fixture());
  return store;
}
afterEach(() => vi.useRealTimers());

describe('item timestamps in the project store', () => {
  it('retains saved dates on reload and leaves unknown historical dates absent', () => {
    const store = setup();
    expect(store.getState().currentProject.items[0]).toMatchObject({ createdAt: BEFORE, updatedAt: BEFORE });
    expect(store.getState().currentProject.items[1]).not.toHaveProperty('createdAt');
    expect(store.getState().currentProject.items[1]).not.toHaveProperty('updatedAt');
  });

  it('creates fresh dates even when a duplicate draft contains source dates', () => {
    const store = setup(); const source = store.getState().currentProject.items[0];
    store.getState().createItemFromDraft({ ...source, name: 'Copied' });
    const items = store.getState().currentProject.items;
    expect(items[2]).toMatchObject({ name: 'Copied', createdAt: NOW, updatedAt: NOW });
    expect(items[2].id).not.toBe(source.id);
    expect(items[0]).toEqual(source);
  });

  it('stamps only actual edits and keeps createdAt immutable', () => {
    const store = setup();
    store.getState().updateItem('one', { name: 'One', createdAt: NOW, updatedAt: NOW });
    expect(store.getState().currentProject.items[0]).toMatchObject({ createdAt: BEFORE, updatedAt: BEFORE });
    store.getState().saveItem('one', { ...store.getState().currentProject.items[0], name: 'Edited', createdAt: NOW });
    expect(store.getState().currentProject.items[0]).toMatchObject({ createdAt: BEFORE, updatedAt: NOW });
    expect(store.getState().currentProject.items[1]).not.toHaveProperty('updatedAt');
  });

  it('tracks bulk metadata and tag edits without changing unrelated or no-op items', () => {
    const store = setup();
    store.getState().bulkUpdateItems(['two'], { isPackaged: true, locationIds: ['office', 'home'] });
    expect(store.getState().currentProject.items[0].updatedAt).toBe(BEFORE);
    expect(store.getState().currentProject.items[1]).toMatchObject({ updatedAt: NOW, isPackaged: true });
    expect(store.getState().currentProject.items[1]).not.toHaveProperty('createdAt');
    vi.setSystemTime(new Date('2026-10-22T13:00:00.000Z'));
    store.getState().bulkUpdateItems(['two'], { isPackaged: true, locationIds: ['office', 'home'] });
    expect(store.getState().currentProject.items[1].updatedAt).toBe(NOW);
    store.getState().renameTag('A-001', 'A-002');
    expect(store.getState().currentProject.items[0].updatedAt).toBe('2026-10-22T13:00:00.000Z');
    expect(store.getState().currentProject.items[1].updatedAt).toBe(NOW);
  });

  it('keeps recency unchanged when catalog names or order change', () => {
    const store = setup();
    store.getState().updateCatalogNode('category', 'cat', { name: 'Equipment' });
    store.getState().reorderCatalogNode('location', 'office', 'home', 'before');
    expect(store.getState().currentProject.items[0]).toMatchObject({ categoryPath: 'Equipment', updatedAt: BEFORE });
    expect(store.getState().currentProject.items[1]).not.toHaveProperty('updatedAt');
  });
});
