'use strict';
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const bounded = (value, fallback, maximum, minimum = 0) => Number.isSafeInteger(value) && value >= minimum ? Math.min(value, maximum) : fallback;

function createCardImageExecutor(options = {}) {
  const concurrency = bounded(options.concurrency, 2, 2, 1);
  const maxQueued = bounded(options.maxQueued, 8, 16);
  const timeoutMs = bounded(options.timeoutMs, 2000, 3000, 1);
  const workerPath = options.workerPath || path.join(__dirname, 'card-image-worker.js');
  const queue = [], active = new Set();
  let closed = false;
  function pump() {
    while (!closed && queue.length && active.size < concurrency) {
      const job = queue.shift();
      let worker, timer, settled = false;
      const finish = result => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        // The slot stays occupied until termination completes. A timed-out
        // decode therefore cannot overlap the next job on the same slot.
        Promise.resolve(worker?.terminate()).catch(() => {}).finally(() => {
          active.delete(job); job.resolve(result); pump();
        });
      };
      job.cancel = () => finish(null); active.add(job);
      try {
        worker = new Worker(workerPath, { resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 } });
        worker.once('message', finish);
        worker.once('error', () => finish(null));
        worker.once('exit', () => finish(null));
        timer = setTimeout(() => finish(null), timeoutMs);
        worker.postMessage(job.input);
      } catch { finish(null); }
    }
  }
  return {
    transform(input) {
      if (closed || (active.size >= concurrency && queue.length >= maxQueued)) return Promise.resolve(null);
      return new Promise(resolve => { queue.push({ input, resolve }); pump(); });
    },
    async close() {
      closed = true;
      for (const job of queue.splice(0)) job.resolve(null);
      const finishing = [...active].map(job => new Promise(resolve => {
        const original = job.resolve; job.resolve = value => { original(value); resolve(); }; job.cancel();
      }));
      await Promise.all(finishing);
    }
  };
}
// Workers exist only during a bounded job and are terminated on completion;
// there are no idle worker handles to keep a standalone NAS process alive.
module.exports = { createCardImageExecutor };
