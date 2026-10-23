// @vitest-environment node
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { createInventoryService } = require('../../server/inventory-service');
const { createMemoryRepository } = require('../../server/repository');
const { createMemoryObjectStore } = require('../../server/oss-store');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=', 'base64');
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
async function setup(options = {}, count = 3) {
  const objects = createMemoryObjectStore();
  const repository = createMemoryRepository();
  const encryptionKey = randomBytes(32);
  const service = createInventoryService({ repository, objects, encryptionKey, ...options });
  const project = { meta: { name: '照片测试' }, categories: [], locations: [], items: Array.from({ length: count }, (_, index) => ({ id: `item-${index}`, name: `照片${index}`, tags: [], imagePath: `old-${index}` })) };
  await service.importProject(project, { includePrivate: true, images: Object.fromEntries(project.items.map((item) => [item.imagePath, { bytes: png, mime: 'image/png' }])) });
  const saved = await service.getProject({ includePrivate: true });
  return { service, objects, repository, encryptionKey, ids: saved.items.map((item) => item.imagePath) };
}

describe('bounded encrypted image reads', () => {
  it('evicts corrupt encrypted bytes so a later read can recover from an upstream repair', async () => {
    const { service, objects, ids } = await setup({}, 1);
    const get = objects.get; let calls = 0;
    objects.get = async (key) => ++calls === 1 ? Buffer.from('corrupt ciphertext') : get(key);
    await expect(service.readImage(ids[0])).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
    expect((await service.readImage(ids[0])).bytes).toEqual(png);
    expect(calls).toBe(2);
  });

  it.each([{ maxBytes: 300, maxEntries: 100 }, { maxBytes: 4096, maxEntries: 1 }])('enforces the independent cache limit %j', async (imageCacheOptions) => {
    const { service, objects, ids } = await setup({ imageCacheOptions }, 2);
    const downloads = vi.spyOn(objects, 'get');
    await service.readImage(ids[0]); await service.readImage(ids[1]); await service.readImage(ids[0]);
    expect(downloads).toHaveBeenCalledTimes(3);
  });

  it('deduplicates in-flight downloads and reuses encrypted generations until their TTL expires', async () => {
    let time = 1000;
    const { service, objects, ids } = await setup({ imageCacheOptions: { ttlMs: 100, now: () => time } });
    const get = objects.get; const gate = deferred(); let downloads = 0;
    objects.get = async (key) => { downloads++; await gate.promise; return get(key); };
    const reads = [service.readImage(ids[0]), service.readImage(ids[0])];
    await vi.waitFor(() => expect(downloads).toBe(1));
    gate.resolve();
    expect((await Promise.all(reads)).map((image) => image.bytes)).toEqual([png, png]);
    await service.readImage(ids[0]); expect(downloads).toBe(1);
    time += 101; await service.readImage(ids[0]); expect(downloads).toBe(2);
  });

  it('bounds retained encrypted bytes and entries with least-recently-used eviction', async () => {
    const { service, objects, ids } = await setup({ imageCacheOptions: { maxBytes: 512, maxEntries: 2 } });
    const get = objects.get; let downloads = 0;
    objects.get = async (key) => { downloads++; return get(key); };
    await service.readImage(ids[0]); await service.readImage(ids[1]);
    await service.readImage(ids[0]); expect(downloads).toBe(2);
    await service.readImage(ids[2]); await service.readImage(ids[1]);
    expect(downloads).toBe(4);
    const uncached = await setup({ imageCacheOptions: { maxBytes: 1 } }, 1);
    const uncachedGet = vi.spyOn(uncached.objects, 'get');
    await uncached.service.readImage(uncached.ids[0]); await uncached.service.readImage(uncached.ids[0]);
    expect(uncachedGet).toHaveBeenCalledTimes(2);
  });

  it('retries a failed download once and does not retain failed promises', async () => {
    const { service, objects, ids } = await setup(); const get = objects.get; let attempts = 0;
    objects.get = async (key) => { if (++attempts <= 2) throw new Error('temporary upstream failure'); return get(key); };
    await expect(service.readImage(ids[0])).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
    expect(attempts).toBe(2);
    expect((await service.readImage(ids[0])).bytes).toEqual(png);
    expect(attempts).toBe(3);
  });

  it('runs bounded parallel downloads and rejects excess admissions without blocking project reads', async () => {
    const { service, objects, ids } = await setup({ imageReadOptions: { concurrency: 2, maxQueued: 1 }, imageCacheOptions: { concurrency: 2 } }, 4);
    const get = objects.get; const gate = deferred(); let active = 0; let peak = 0;
    objects.get = async (key) => { active++; peak = Math.max(peak, active); try { await gate.promise; return await get(key); } finally { active--; } };
    const first = service.readImage(ids[0]); const second = service.readImage(ids[1]);
    const queued = service.readImage(ids[2]); const excess = service.readImage(ids[3]).catch((error) => error);
    const project = service.getProject();
    let parallel;
    try { await vi.waitFor(() => expect(active).toBe(2), { timeout: 200 }); parallel = await Promise.race([project.then(() => true), new Promise((done) => setTimeout(() => done(false), 50))]); }
    finally { gate.resolve(); }
    await Promise.all([first, second, queued]);
    expect(parallel).toBe(true); expect(peak).toBe(2);
    expect(await excess).toMatchObject({ code: 'STORAGE_UNAVAILABLE', status: 503 });
  });

  it.each(['delete', 'private', 'generation'])('rechecks current authorization after a delayed read during %s mutation', async (change) => {
    const { service, objects, ids } = await setup({}, 1);
    const project = await service.getProject({ includePrivate: true });
    const get = objects.get; const gate = deferred(); const started = deferred();
    objects.get = async (key) => { const bytes = await get(key); started.resolve(); await gate.promise; return bytes; };
    const reading = service.readImage(ids[0]).catch((error) => error);
    await started.promise;
    if (change === 'delete') project.items = [];
    else if (change === 'private') project.items[0].isPrivate = true;
    else { project.categories = [{ id: 'moved', name: '新分类', parentId: null, level: 1 }]; project.items[0].categoryId = 'moved'; }
    // Verification of a copied destination is a mutation read, not the delayed old-generation download.
    objects.get = get;
    const saving = service.saveProject(project, { includePrivate: true });
    const savedBeforeDownload = await Promise.race([saving.then(() => true), new Promise((done) => setTimeout(() => done(false), 100))]);
    gate.resolve(); await saving;
    expect(savedBeforeDownload).toBe(true);
    expect(await reading).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('checks visibility on every warm hit and never reuses an old generation after a move', async () => {
    const { service, objects, ids } = await setup({}, 1);
    await service.readImage(ids[0]);
    let project = await service.getProject({ includePrivate: true }); project.items[0].isPrivate = true;
    await service.saveProject(project, { includePrivate: true });
    const downloads = vi.spyOn(objects, 'get');
    await expect(service.readImage(ids[0])).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(downloads).not.toHaveBeenCalled();
    expect((await service.readImage(ids[0], { includePrivate: true })).bytes).toEqual(png);
    expect(downloads).not.toHaveBeenCalled();
    project = await service.getProject({ includePrivate: true });
    project.categories = [{ id: 'moved', name: '新分类', parentId: null, level: 1 }]; project.items[0].categoryId = 'moved';
    await service.saveProject(project, { includePrivate: true }); downloads.mockClear();
    expect((await service.readImage(ids[0], { includePrivate: true })).bytes).toEqual(png);
    expect(downloads).toHaveBeenCalledTimes(1);
  });
});
