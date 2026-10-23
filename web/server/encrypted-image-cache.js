'use strict';
const { StorageError } = require('./errors');

function boundedInteger(value, fallback, maximum, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum ? Math.min(value, maximum) : fallback;
}

// Admission is bounded before work is scheduled, including callers waiting for
// canonical authorization. Image traffic cannot grow the mutation queue forever.
function createBoundedExecutor({ concurrency = 4, maxQueued = 32 } = {}) {
  const limit = boundedInteger(concurrency, 4, 16, 1);
  const queueLimit = boundedInteger(maxQueued, 32, 128);
  const queue = [];
  let active = 0;
  function start({ task, resolve, reject }) {
    active++;
    Promise.resolve().then(task).then(resolve, reject).finally(() => {
      active--;
      if (queue.length) start(queue.shift());
    });
  }
  return (task) => {
    if (active >= limit && queue.length >= queueLimit) return Promise.reject(new StorageError());
    return new Promise((resolve, reject) => {
      const entry = { task, resolve, reject };
      if (active < limit) start(entry);
      else queue.push(entry);
    });
  };
}

function createEncryptedImageCache(options = {}) {
  const maxBytes = boundedInteger(options.maxBytes, 64 * 1024 * 1024, 128 * 1024 * 1024);
  const maxEntries = boundedInteger(options.maxEntries, 128, 1024);
  const ttlMs = boundedInteger(options.ttlMs, 60 * 1000, 5 * 60 * 1000);
  const now = options.now || Date.now;
  const execute = createBoundedExecutor(options);
  const entries = new Map();
  const inFlight = new Map();
  let retainedBytes = 0;
  function remove(generation) {
    const entry = entries.get(generation);
    if (entry) { retainedBytes -= entry.bytes.length; entries.delete(generation); }
  }
  function prune() {
    const time = now();
    for (const [generation, entry] of entries) if (entry.expiresAt <= time) remove(generation);
  }
  return {
    discard(generation) { remove(generation); },
    read(generation, load) {
      prune();
      const hit = entries.get(generation);
      if (hit) {
        entries.delete(generation); entries.set(generation, hit);
        return Promise.resolve(hit.bytes);
      }
      if (inFlight.has(generation)) return inFlight.get(generation);
      // The executor's bounded queue also bounds distinct in-flight generations.
      const pending = execute(async () => {
        let bytes;
        for (let attempt = 0; attempt < 2; attempt++) {
          try { bytes = await load(); break; }
          catch (error) { if (attempt || error?.code === 'NOT_FOUND') throw error; }
        }
        if (!Buffer.isBuffer(bytes) || bytes.length > 30 * 1024 * 1024) throw new StorageError();
        bytes = Buffer.from(bytes);
        prune();
        if (bytes.length <= maxBytes && maxEntries > 0 && ttlMs > 0) {
          while (entries.size && (retainedBytes + bytes.length > maxBytes || entries.size >= maxEntries)) remove(entries.keys().next().value);
          entries.set(generation, { bytes, expiresAt: now() + ttlMs }); retainedBytes += bytes.length;
        }
        return bytes;
      }).finally(() => { inFlight.delete(generation); });
      inFlight.set(generation, pending);
      return pending;
    }
  };
}

module.exports = { createBoundedExecutor, createEncryptedImageCache };
