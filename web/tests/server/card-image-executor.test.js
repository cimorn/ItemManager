// @vitest-environment node
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { createCardImageExecutor } = require('../../server/card-image-executor');
const workerPath = fileURLToPath(new URL('../fixtures/card-worker.cjs', import.meta.url));
const cleanup = [];
afterEach(async () => { for (const executor of cleanup.splice(0)) await executor.close(); });
function pool(options = {}) { const executor = createCardImageExecutor({ workerPath, ...options }); cleanup.push(executor); return executor; }
describe('bounded card worker executor', () => {
  it('bounds active and queued work and recovers its slot after a hung worker deadline', async () => {
    const executor = pool({ concurrency: 1, maxQueued: 1, timeoutMs: 200 });
    const stalled = executor.transform({ mode: 'hang' });
    const queued = executor.transform({ mode: 'pass' });
    expect(await executor.transform({ mode: 'excess' })).toBeNull();
    expect(await stalled).toBeNull();
    expect(Buffer.from((await queued).bytes).toString()).toBe('preview');
  });
  it.each(['error', 'exit'])('returns a bounded fallback after worker %s and accepts subsequent work', async (mode) => {
    const executor = pool({ concurrency: 1 });
    expect(await executor.transform({ mode })).toBeNull();
    expect(Buffer.from((await executor.transform({ mode: 'pass' })).bytes).toString()).toBe('preview');
  });
  it('closes active and queued workers promptly and admits no work afterward', async () => {
    const executor = pool({ concurrency: 1, maxQueued: 1 });
    const active = executor.transform({ mode: 'hang' }), queued = executor.transform({ mode: 'hang' });
    await executor.close();
    expect(await Promise.all([active, queued])).toEqual([null, null]);
    expect(await executor.transform({ mode: 'pass' })).toBeNull();
    await executor.close();
  });
});
