import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import * as data from '../../src/renderer/lib/project-data';
import { createProjectStore } from '../../src/renderer/store/project-store';
import { applyItemGalleryFilters, buildItemCardView } from '../../src/renderer/features/items/item-gallery-selectors';
import TagManager from '../../src/renderer/features/tags/TagManager';
function fixture() {
  return { meta: {}, categories: [{ id: 'cat', name: 'Tools', level: 1, parentId: null }], locations: [
    { id: 'room', name: 'Room', level: 1, parentId: null }, { id: 'box', name: 'Box', level: 2, parentId: 'room' },
    { id: 'other', name: 'Other', level: 1, parentId: null }
  ], items: [{ id: 'item', name: 'Scissors', categoryId: 'cat', locationId: 'box', tags: ['T-001'] }] };
}
function storeFor(p = fixture()) { const store = createProjectStore(); store.getState().setProject(p); return store; }

describe('item location and privacy helpers', () => {
  it('bounds all-location path derivation for a supported large catalog', () => {
    const p = fixture(); p.locations = Array.from({ length: 3000 }, (_, i) => ({ id: `loc-${i}`, name: `Location ${i}`, level: 1, parentId: null }));
    p.items = Array.from({ length: 300 }, (_, i) => ({ id: `item-${i}`, categoryId: 'cat', locationIds: p.locations.slice(0, 32).map(n => n.id) }));
    const start = performance.now(); const result = data.sanitizeProject(p);
    expect(result.items[0].locationPaths).toHaveLength(32); expect(performance.now() - start).toBeLessThan(1500);
  });
  it('loads existing locked projections with omitted secondary catalog branches', () => {
    const p = fixture(); p.items[0].locationIds = ['box', 'other']; p.locations = p.locations.filter(n => n.id !== 'other'); p.privacy = { enabled: true, locked: true };
    const store = storeFor(p);
    expect(store.getState().currentProject.items[0].locationIds).toEqual(['box', 'other']);
    store.getState().updateItem('item', { name: 'Blocked' }); expect(store.getState().currentProject.items[0].name).toBe('Scissors');
  });
  it('reads legacy locations and authoritative deduplicated ordered arrays', () => {
    expect(data.getItemLocationIds({ locationId: 'box' })).toEqual(['box']);
    expect(data.getItemLocationIds({ locationId: 'box', locationIds: [] })).toEqual([]);
    expect(data.getItemLocationIds({ locationIds: ['other', 'box', 'other'] })).toEqual(['other', 'box']);
  });
  it('derives inherited category and location privacy without treating location Look as private', () => {
    const p = fixture(); p.locations[0].isPrivate = true; p.items[0].locationIds = ['other', 'box'];
    expect(data.isCatalogNodePrivate(p.locations, 'box', { categoryNames: [] })).toBe(true);
    expect(data.isItemPrivate({ ...p.items[0], isPrivate: false }, p)).toBe(true);
    p.locations[0].isPrivate = false; p.locations[0].name = 'Look';
    expect(data.isItemPrivate(p.items[0], p)).toBe(false);
    p.categories[0].name = 'Look'; expect(data.isItemPrivate(p.items[0], p)).toBe(true);
  });
  it('keeps legacy optional shapes, but preserves explicit false and empty arrays', () => {
    const p = fixture(); const legacy = data.sanitizeProject(p);
    expect(legacy.items[0]).not.toHaveProperty('locationIds'); expect(legacy.items[0]).not.toHaveProperty('locationPaths');
    expect(legacy.items[0]).not.toHaveProperty('isPackaged'); expect(legacy.categories[0]).not.toHaveProperty('isPrivate');
    Object.assign(p.items[0], { locationIds: [], isPackaged: false }); p.categories[0].isPrivate = false;
    expect(data.sanitizeProject(p).items[0]).toMatchObject({ locationIds: [], locationId: null, locationPaths: [], isPackaged: false });
    expect(data.sanitizeProject(p).categories[0].isPrivate).toBe(false);
  });
  it.each([null, 'box', [null], ['missing'], Array(33).fill('box')].map(value => [value]))('rejects invalid location metadata %j', locationIds => {
    const p = fixture(); p.items[0].locationIds = locationIds; expect(() => data.sanitizeProject(p)).toThrow();
  });
  it.each([null, 'true', 1])('rejects nonboolean metadata %j', value => {
    for (const [key, field] of [['items', 'isPackaged'], ['categories', 'isPrivate'], ['locations', 'isPrivate']]) {
      const p = fixture(); p[key][0][field] = value; expect(() => data.sanitizeProject(p)).toThrow();
    }
  });
});

describe('store item metadata mutations', () => {
  it.each(['saveItem', 'updateItem'])('keeps multiple locations when legacy %s resubmits the unchanged primary', method => {
    const p = fixture(); Object.assign(p.items[0], { locationIds: ['box', 'other'], isPackaged: true });
    const store = storeFor(p);
    store.getState()[method]('item', { name: 'Edited in an older tab', locationId: 'box' });
    expect(store.getState().currentProject.items[0]).toMatchObject({ name: 'Edited in an older tab', locationIds: ['box', 'other'], locationId: 'box', locationPaths: ['Room / Box', 'Other'], isPackaged: true });
  });
  it.each(['saveItem', 'updateItem'])('replaces multiple locations when legacy %s changes the primary and honors explicit arrays', method => {
    const p = fixture(); p.items[0].locationIds = ['box', 'other']; const store = storeFor(p);
    store.getState()[method]('item', { name: 'Moved', locationId: 'other' });
    expect(store.getState().currentProject.items[0]).toMatchObject({ locationIds: ['other'], locationId: 'other', locationPaths: ['Other'] });
    store.getState()[method]('item', { locationId: 'box', locationIds: [] });
    expect(store.getState().currentProject.items[0]).toMatchObject({ locationIds: [], locationId: null, locationPaths: [] });
  });
  it('always replaces the entire location list for a bulk primary assignment, including the same primary', () => {
    const p = fixture(); p.items[0].locationIds = ['box', 'other']; const store = storeFor(p);
    store.getState().bulkUpdateItems(['item'], { locationId: 'box' });
    expect(store.getState().currentProject.items[0]).toMatchObject({ locationIds: ['box'], locationId: 'box', locationPaths: ['Room / Box'] });
  });
  it('creates, edits and bulk replaces ordered locations while unrelated patches retain them', () => {
    const store = storeFor(); const state = () => store.getState(); const item = () => state().currentProject.items.find(i => i.id === state().selectedItemId);
    state().createItemFromDraft({ name: 'New', locationIds: ['other', 'box', 'other'], isPackaged: true });
    const id = state().selectedItemId;
    expect(item()).toMatchObject({ locationIds: ['other', 'box'], locationId: 'other', locationPaths: ['Other', 'Room / Box'], isPackaged: true });
    state().updateItem(id, { notes: 'Updated' }); expect(item().locationIds).toEqual(['other', 'box']);
    state().saveItem(id, { ...item(), locationIds: ['box', 'other'], isPackaged: false }); expect(item().locationId).toBe('box');
    state().updateItem(id, { locationId: 'room' }); expect(item().locationIds).toEqual(['room']);
    state().bulkUpdateItems([id], { locationIds: ['box', 'other'], isPackaged: true }); expect(item().isPackaged).toBe(true);
    state().bulkUpdateItems([id], { locationId: 'other' }); expect(item().locationIds).toEqual(['other']);
    state().saveItem(id, { name: 'Still new' }); expect(item().locationIds).toEqual(['other']); expect(item().isPackaged).toBe(true);
    state().updateItem(id, { locationIds: [] }); expect(item()).toMatchObject({ locationIds: [], locationId: null, locationPaths: [] });
  });
  it('removes only deleted subtree assignments and advances the primary, preserving privacy', () => {
    const p = fixture(); p.locations[0].isPrivate = true; p.items[0].locationIds = ['box', 'other'];
    const store = storeFor(p); store.getState().selectCatalogNode('location', 'room'); store.getState().deleteCatalogNode('location');
    expect(store.getState().currentProject.items[0]).toMatchObject({ locationIds: ['other'], locationId: 'other', locationPaths: ['Other'], isPrivate: true });
    store.getState().selectCatalogNode('location', 'other'); store.getState().deleteCatalogNode('location');
    expect(store.getState().currentProject.items[0]).toMatchObject({ locationIds: [], locationId: null, isPrivate: true });
  });
  it('retains privacy when a private category or secondary location assignment is removed', () => {
    const p = fixture(); p.items[0].locationIds = ['other', 'box'];
    const store = storeFor(p); store.getState().updateCatalogNode('category', 'cat', { isPrivate: true }); store.getState().selectCatalogNode('category', 'cat'); store.getState().deleteCatalogNode('category');
    expect(store.getState().currentProject.items[0].isPrivate).toBe(true);
    const q = fixture(); q.items[0].locationIds = ['other', 'box']; store.getState().setProject(q); store.getState().updateCatalogNode('location', 'room', { isPrivate: true });
    store.getState().updateItem('item', { locationIds: ['other'] }); expect(store.getState().currentProject.items[0].isPrivate).toBe(true);
  });
  it('recomputes all paths after rename and reparent while keeping inherited privacy sticky', () => {
    const p = fixture(); p.items[0].locationIds = ['other', 'box']; p.locations[0].isPrivate = true;
    const store = storeFor(p); store.getState().updateCatalogNode('location', 'box', { parentId: 'other', name: 'Shelf' });
    expect(store.getState().currentProject.items[0]).toMatchObject({ locationPaths: ['Other', 'Other / Shelf'], isPrivate: true });
    store.getState().updateCatalogNode('location', 'other', { name: 'Storage' });
    expect(store.getState().currentProject.items[0].locationPaths).toEqual(['Storage', 'Storage / Shelf']);
  });
  it.each(['category', 'location'])('accepts privacy metadata for every %s creation method and privacy-only updates', mode => {
    const store = storeFor(); const key = mode === 'category' ? 'categories' : 'locations';
    store.getState().addCatalogRoot(mode, 'Private root', { isPrivate: true });
    const root = store.getState().selectedCatalogNodeIds[mode];
    store.getState().addCatalogSibling(mode, 'Private sibling', { isPrivate: false });
    store.getState().selectCatalogNode(mode, root); store.getState().addCatalogChild(mode, 'Private child', { isPrivate: true });
    let nodes = store.getState().currentProject[key]; expect(nodes.find(n => n.id === root).isPrivate).toBe(true);
    expect(nodes.find(n => n.name === 'Private sibling').isPrivate).toBe(false); expect(nodes.find(n => n.name === 'Private child').isPrivate).toBe(true);
    store.getState().updateCatalogNode(mode, root, { isPrivate: false });
    nodes = data.sanitizeProject(store.getState().currentProject)[key]; expect(nodes.find(n => n.id === root)).toMatchObject({ name: 'Private root', isPrivate: false });
  });
});

describe('secondary location discovery', () => {
  it('shows all distinct paths in cards and searches and filters by secondary paths', () => {
    const p = fixture(); p.items[0].locationIds = ['other', 'box']; const store = storeFor(p); const project = store.getState().currentProject;
    expect(buildItemCardView(project.items[0], '').locationLine).toBe('Other；Room · Box');
    expect(applyItemGalleryFilters(project.items, project.categories, project.locations, { locationId: 'room' })).toHaveLength(1);
    expect(applyItemGalleryFilters(project.items, project.categories, project.locations, {}, 'Room / Box')).toHaveLength(1);
    store.getState().setSearch('Room / Box'); expect(store.getState().getVisibleItems()).toHaveLength(1);
  });
  it('filters tag summaries by secondary location descendants', async () => {
    const p = fixture(); p.items[0].locationIds = ['other', 'box']; p.items[0].locationId = 'other';
    render(<TagManager {...p} />); await userEvent.setup().selectOptions(screen.getByLabelText('按一级位置筛选标签'), 'room');
    expect(screen.getByRole('checkbox', { name: '选择标签 T-001' })).toBeInTheDocument();
  });
});
