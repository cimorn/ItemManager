// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { applyItemTimestamps as applyRendererItemTimestamps } from '../../src/renderer/lib/item-timestamps';
const require = createRequire(import.meta.url);
const { applyItemTimestamps: applyServerItemTimestamps } = require('../../server/item-timestamps');

const BEFORE = '2026-10-20T08:00:00.000Z';
const NOW = '2026-10-22T12:00:00.000Z';
const FUTURE = '2099-01-01T00:00:00.000Z';
function fixture() {
  return { meta: {}, categories: [{ id: 'cat', name: 'Tools' }], locations: [], items: [
    { id: 'one', name: 'One', categoryId: 'cat', tags: ['A', 'B'], createdAt: BEFORE, updatedAt: BEFORE },
    { id: 'legacy', name: 'Legacy', categoryId: 'cat', tags: [] }
  ] };
}
describe.each([
  ['server', applyServerItemTimestamps],
  ['renderer', applyRendererItemTimestamps]
])('%s item timestamp semantics', (_name, applyItemTimestamps) => {
  function update(previous, change) {
    const next = structuredClone(previous); change(next);
    return applyItemTimestamps(previous, next, new Date(NOW));
  }
  it('assigns server time to new items, including copied rows, ignoring submitted dates', () => {
    const previous = fixture();
    const result = update(previous, next => next.items.push({ ...next.items[0], id: 'copy', createdAt: FUTURE, updatedAt: FUTURE }));
    expect(result.items[2]).toMatchObject({ id: 'copy', createdAt: NOW, updatedAt: NOW });
    expect(result.items[0]).toEqual(previous.items[0]);
    expect(previous.items).toHaveLength(2);
  });

  it('restores omitted or tampered dates on a no-op save and item reorder', () => {
    const previous = fixture();
    const result = update(previous, next => {
      delete next.items[0].createdAt; next.items[0].updatedAt = FUTURE;
      Object.assign(next.items[1], { createdAt: FUTURE, updatedAt: FUTURE });
      next.items.reverse();
    });
    expect(result.items.find(item => item.id === 'one')).toEqual(previous.items[0]);
    expect(result.items.find(item => item.id === 'legacy')).toEqual(previous.items[1]);
  });

  it('changes only updatedAt for an edited historical item without inventing its creation date', () => {
    const previous = fixture();
    const result = update(previous, next => {
      next.items[0].name = 'Renamed'; next.items[0].createdAt = FUTURE;
      next.items[1].name = 'Updated legacy'; next.items[1].createdAt = FUTURE;
    });
    expect(result.items[0]).toMatchObject({ createdAt: BEFORE, updatedAt: NOW });
    expect(result.items[1].updatedAt).toBe(NOW);
    expect(result.items[1]).not.toHaveProperty('createdAt');
  });

  it.each([
    ['name', 'New name'], ['brand', 'Brand'], ['quantity', '2'], ['specification', 'Model'], ['notes', 'A note'],
    ['barcode', '123'], ['code', '456'], ['categoryId', 'different'], ['locationId', 'room'],
    ['locationIds', ['room', 'office']], ['imagePath', 'img_new'], ['isPackaged', true], ['isPrivate', true], ['tags', ['A', 'C']]
  ])('records changes to %s without changing another item', (field, value) => {
    const previous = fixture();
    const result = update(previous, next => { next.items[0][field] = value; });
    expect(result.items[0]).toMatchObject({ createdAt: BEFORE, updatedAt: NOW });
    expect(result.items[1]).toEqual(previous.items[1]);
  });

  it('ignores derived catalog paths, catalog order, tag order and absent false flags', () => {
    const previous = fixture(); previous.items[0].locationId = 'room';
    const result = update(previous, next => {
      next.categories[0].name = 'Renamed catalog';
      next.categories[0].sortOrder = 8;
      Object.assign(next.items[0], { categoryPath: 'Renamed catalog', locationPath: 'Renamed room', locationIds: ['room'], locationPaths: ['Renamed room'], isPrivate: false, isPackaged: false, tags: ['B', 'A'] });
      next.items[1].name = 'Public edit';
    });
    expect(result.items[0]).toMatchObject({ createdAt: BEFORE, updatedAt: BEFORE });
    expect(result.items[1].updatedAt).toBe(NOW);
  });
});
