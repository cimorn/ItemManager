// @vitest-environment node
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { validateProject, projectPublicProjection, isPrivateItem } = require('../../server/project-validation');
const { createInventoryService } = require('../../server/inventory-service');
const { createMemoryRepository } = require('../../server/repository');
const { createMemoryObjectStore } = require('../../server/oss-store');

function fixture() {
  return { meta: {}, categories: [{ id: 'cat', name: 'Tools', level: 1, parentId: null }], locations: [
    { id: 'room', name: 'Room', level: 1, parentId: null },
    { id: 'box', name: 'Box', level: 2, parentId: 'room' },
    { id: 'other', name: 'Other', level: 1, parentId: null }
  ], items: [{ id: 'item', name: 'Scissors', categoryId: 'cat', locationId: 'box', tags: [], imagePath: '' }] };
}
async function setup(project = fixture()) {
  const options = { repository: createMemoryRepository(), objects: createMemoryObjectStore(), encryptionKey: randomBytes(32) };
  const service = createInventoryService(options);
  await service.importProject(project, { includePrivate: true });
  return { service, options };
}

describe('optional item and catalog metadata validation', () => {
  it('stores spaces in detail fields even when older clients submit middle dots', async () => {
    const { service } = await setup();
    const project = await service.getProject({ includePrivate: true });
    Object.assign(project.items[0], { notes: '白色·S', specification: '印花·镂空', name: 'A·B', brand: 'Some·Brand' });
    const saved = await service.saveProject(project, { includePrivate: true });
    expect(saved.items[0]).toMatchObject({ notes: '白色 S', specification: '印花 镂空', name: 'A·B', brand: 'Some·Brand' });
    const stored = (await service.backup()).project.items[0];
    expect(stored.notes).toBe('白色 S');
    expect(stored.specification).toBe('印花 镂空');
  });

  it('bounds validation and projection work for a supported catalog with 32 locations per item', () => {
    const p = fixture(); p.locations = Array.from({ length: 3000 }, (_, i) => ({ id: `loc-${i}`, name: `Location ${i}`, level: 1, parentId: null }));
    p.items = Array.from({ length: 300 }, (_, i) => ({ id: `item-${i}`, categoryId: 'cat', locationIds: p.locations.slice(0, 32).map(n => n.id) }));
    const start = performance.now();
    const visible = projectPublicProjection(validateProject(p));
    expect(visible.items).toHaveLength(300); expect(visible.items[0].locationPaths).toHaveLength(32);
    expect(performance.now() - start).toBeLessThan(1500);
  });
  it('keeps optional fields absent on legacy validation, GET and backup', async () => {
    const canonical = validateProject(fixture());
    const { service } = await setup();
    for (const project of [canonical, await service.getProject(), (await service.backup()).project]) {
      expect(project.items[0]).not.toHaveProperty('locationIds');
      expect(project.items[0]).not.toHaveProperty('locationPaths');
      expect(project.items[0]).not.toHaveProperty('isPackaged');
      expect(project.categories[0]).not.toHaveProperty('isPrivate');
    }
  });
  it('normalizes ordered locations and derives every path with the first as primary', () => {
    const p = fixture(); Object.assign(p.items[0], { locationIds: ['other', 'box', 'other'], isPackaged: false });
    p.categories[0].isPrivate = false;
    const result = validateProject(p);
    expect(result.items[0]).toMatchObject({ locationIds: ['other', 'box'], locationId: 'other', locationPath: 'Other', locationPaths: ['Other', 'Room / Box'], isPackaged: false });
    expect(result.categories[0].isPrivate).toBe(false);
    p.items[0].locationIds = [];
    expect(validateProject(p).items[0]).toMatchObject({ locationIds: [], locationId: null, locationPath: '', locationPaths: [] });
  });
  it.each([null, 'box', {}, ['missing'], ['box', 'bad/id'], ['box', null], Array(33).fill('box')].map(value => [value]))('rejects invalid explicit location list %j', locationIds => {
    const p = fixture(); p.items[0].locationIds = locationIds;
    expect(() => validateProject(p)).toThrow();
  });
  it.each([null, 'true', 0])('rejects nonboolean optional metadata %j', value => {
    for (const target of ['item', 'category', 'location']) {
      const p = fixture(); (target === 'item' ? p.items[0] : p[target === 'category' ? 'categories' : 'locations'][0])[target === 'item' ? 'isPackaged' : 'isPrivate'] = value;
      expect(() => validateProject(p)).toThrow();
    }
  });
});

describe('inherited catalog privacy', () => {
  it('protects category descendants and any secondary location despite a false manual flag', () => {
    const p = fixture(); p.locations[0].isPrivate = true;
    Object.assign(p.items[0], { locationId: 'other', locationIds: ['other', 'box'], isPrivate: false });
    expect(isPrivateItem(p.items[0], p)).toBe(true);
    p.locations[0].isPrivate = false; p.categories[0].isPrivate = true;
    p.categories.push({ id: 'child', name: 'Child', parentId: 'cat', level: 2 }); p.items[0].categoryId = 'child';
    expect(isPrivateItem(p.items[0], p)).toBe(true);
    p.categories[0].isPrivate = false; p.categories[0].name = 'Look';
    expect(isPrivateItem(p.items[0], p)).toBe(true);
  });
  it('hides empty explicit private nodes and descendants while retaining shared ordinary locations', () => {
    const p = fixture();
    p.categories.push({ id: 'secret', name: 'Secret', level: 1, parentId: null, isPrivate: true }, { id: 'child', name: 'Child', level: 2, parentId: 'secret', isPrivate: false });
    p.locations.push({ id: 'vault', name: 'Vault', level: 1, parentId: null, isPrivate: true }, { id: 'shelf', name: 'Shelf', level: 2, parentId: 'vault' });
    const empty = projectPublicProjection(validateProject(p));
    expect(empty.categories.map(n => n.id)).toEqual(['cat']); expect(empty.locations.map(n => n.id)).toEqual(['room', 'box', 'other']);
    p.items.push({ id: 'hidden', categoryId: 'secret', locationIds: ['box', 'shelf'], isPrivate: false });
    const visible = projectPublicProjection(validateProject(p));
    expect(visible.categories.map(n => n.id)).toEqual(['cat']);
    expect(visible.locations.map(n => n.id)).toEqual(['room', 'box', 'other']);
    expect(visible.items.map(n => n.id)).toEqual(['item']);
  });
  it('retains the full hidden list and its ancestors during partial ordinary saves', async () => {
    const p = fixture(); p.locations.push({ id: 'vault', name: 'Vault', level: 1, parentId: null, isPrivate: true });
    p.items.push({ id: 'hidden', name: 'Hidden', locationIds: ['box', 'vault'], categoryId: 'cat', isPackaged: true });
    const { service } = await setup(p); const ordinary = await service.getProject();
    ordinary.locations = []; ordinary.categories = []; ordinary.items = [];
    await service.saveProject(ordinary);
    const all = await service.getProject({ includePrivate: true });
    expect(all.items[0]).toMatchObject({ id: 'hidden', locationIds: ['box', 'vault'], isPackaged: true });
    expect(all.locations.map(n => n.id)).toEqual(expect.arrayContaining(['box', 'room', 'vault']));
  });
  it('rejects hidden secondary location injection', async () => {
    const p = fixture(); p.locations.push({ id: 'vault', name: 'Vault', level: 1, parentId: null, isPrivate: true });
    const { service } = await setup(p); const ordinary = await service.getProject();
    ordinary.items[0].locationIds = ['box', 'vault'];
    await expect(service.saveProject(ordinary)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('old open browser save compatibility', () => {
  it('restores secondary location ancestors for a partial old ordinary save', async () => {
    const p = fixture(); p.items[0].locationIds = ['box', 'other'];
    const { service } = await setup(p); const opened = await service.getProject();
    delete opened.items[0].locationIds; opened.locations = [];
    await service.saveProject(opened);
    const saved = await service.getProject();
    expect(saved.items[0].locationIds).toEqual(['box', 'other']);
    expect(saved.locations.map(node => node.id)).toEqual(expect.arrayContaining(['box', 'room', 'other']));
  });
  it.each([false, true])('preserves omitted fields in %s full scope and honors explicit values', async includePrivate => {
    const p = fixture(); Object.assign(p.items[0], { locationIds: ['box', 'other'], isPackaged: true });
    p.categories[0].isPrivate = false; p.locations[2].isPrivate = false;
    const { service, options } = await setup(p);
    let opened = await service.getProject({ includePrivate });
    delete opened.items[0].locationIds; delete opened.items[0].isPackaged;
    delete opened.categories[0].isPrivate; delete opened.locations[2].isPrivate;
    opened.items[0].name = 'Edited in old tab';
    await service.saveProject(opened, { includePrivate });
    opened = await createInventoryService(options).getProject({ includePrivate: true });
    expect(opened.items[0]).toMatchObject({ locationIds: ['box', 'other'], isPackaged: true });
    expect(opened.categories[0].isPrivate).toBe(false); expect(opened.locations[2].isPrivate).toBe(false);
    opened.items[0].locationIds = []; opened.items[0].isPackaged = false;
    await service.saveProject(opened, { includePrivate: true });
    expect((await service.getProject({ includePrivate: true })).items[0]).toMatchObject({ locationIds: [], locationId: null, isPackaged: false });
  });
  it.each([false, true])('replaces the whole list when an old tab changes primary in scope %s', async includePrivate => {
    const p = fixture(); p.items[0].locationIds = ['box', 'other']; const { service } = await setup(p);
    const opened = await service.getProject({ includePrivate }); delete opened.items[0].locationIds; opened.items[0].locationId = 'room';
    await service.saveProject(opened, { includePrivate });
    expect((await service.getProject({ includePrivate: true })).items[0]).toMatchObject({ locationIds: ['room'], locationId: 'room' });
  });
  it('preserves omitted private node flags in full scope and permits explicit false', async () => {
    const p = fixture(); p.categories[0].isPrivate = true; p.locations[0].isPrivate = true;
    const { service } = await setup(p); let opened = await service.getProject({ includePrivate: true });
    delete opened.categories[0].isPrivate; delete opened.locations[0].isPrivate;
    await service.saveProject(opened, { includePrivate: true }); opened = await service.getProject({ includePrivate: true });
    expect(opened.categories[0].isPrivate).toBe(true); expect(opened.locations[0].isPrivate).toBe(true);
    opened.categories[0].isPrivate = false; opened.locations[0].isPrivate = false;
    await service.saveProject(opened, { includePrivate: true });
    expect((await service.getProject({ includePrivate: true })).categories[0].isPrivate).toBe(false);
    expect((await service.getProject()).items).toHaveLength(0);
  });
  it('does not clear previously effective privacy after node deletion or reparenting', async () => {
    const p = fixture(); p.locations[0].isPrivate = true; p.items[0].locationIds = ['other', 'box'];
    const { service } = await setup(p); let opened = await service.getProject({ includePrivate: true });
    opened.locations[1].parentId = 'other'; opened.items[0].locationIds = ['other'];
    await service.saveProject(opened, { includePrivate: true }); opened = await service.getProject({ includePrivate: true });
    opened.locations = opened.locations.filter(n => n.id !== 'room');
    await service.saveProject(opened, { includePrivate: true });
    expect((await service.getProject()).items).toHaveLength(0);
  });
});

describe('catalog privacy during cached image reads', () => {
  it.each(['categories', 'locations'])('revokes delayed and warm image reads after %s privacy changes', async key => {
    const p = fixture(); p.items[0].locationIds = ['other', 'box'];
    const { service, options } = await setup(p);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=', 'base64');
    const { imageId } = await service.uploadImage({ bytes: png, mime: 'image/png' });
    let project = await service.getProject({ includePrivate: true }); project.items[0].imagePath = imageId;
    await service.saveProject(project, { includePrivate: true });
    let release, began;
    const gate = new Promise(resolve => { release = resolve; }); const started = new Promise(resolve => { began = resolve; });
    const get = options.objects.get; options.objects.get = async objectKey => { const bytes = await get(objectKey); began(); await gate; return bytes; };
    const reading = service.readImage(imageId).catch(error => error); await started;
    project = await service.getProject({ includePrivate: true }); project[key][0].isPrivate = true;
    try { await service.saveProject(project, { includePrivate: true }); } finally { release(); }
    expect(await reading).toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.readImage(imageId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await service.readImage(imageId, { includePrivate: true })).bytes).toEqual(png);
  });
});
