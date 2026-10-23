'use strict';
const { createApp } = require('./app');
const { loadConfig } = require('./config');
const { createInventoryService } = require('./inventory-service');
const { createMemoryRepository, createMongoRepository } = require('./repository');
const { createMemoryObjectStore, createOssStore } = require('./oss-store');

async function startServer({ config = loadConfig(), staticDir } = {}) {
  // Memory storage is reachable only through the explicit preview configuration.
  // A production connection/configuration failure always aborts startup.
  const repository = config.preview ? createMemoryRepository() : await createMongoRepository(config.mongo);
  let server; let timer; let service;
  try {
    const objects = config.preview ? createMemoryObjectStore() : createOssStore(config.oss);
    service = createInventoryService({ repository, objects, encryptionKey: config.encryptionKey, rules: config.rules });
    await service.retryPending();
    const app = createApp({ service, config, staticDir });
    server = await new Promise((resolve, reject) => {
      const listener = app.listen(config.port, config.host, () => resolve(listener));
      listener.once('error', reject);
    });
    server.requestTimeout = 60 * 1000; server.headersTimeout = 15 * 1000; server.maxHeadersCount = 64;
    let retrying = false;
    timer = setInterval(async () => {
      if (retrying) return;
      retrying = true;
      try { await service.retryPending(); } catch { /* Retain durable work for the next attempt. */ }
      finally { retrying = false; }
    }, 60 * 1000);
    timer.unref();
    let closed = false;
    return {
      app, server, service,
      async close() {
        if (closed) return;
        closed = true; clearInterval(timer);
        await service.close();
        await new Promise((resolve) => server.close(resolve));
        await repository.close?.();
      }
    };
  } catch (error) {
    if (timer) clearInterval(timer);
    await service?.close();
    if (server) await new Promise((resolve) => server.close(resolve));
    await repository.close?.();
    throw error;
  }
}
if (require.main === module) {
  startServer().then(instance => {
    console.log('物品管理服务已启动');
    const stop = () => instance.close().then(() => { process.exitCode = 0; }).catch(() => { process.exitCode = 1; });
    process.once('SIGTERM', stop); process.once('SIGINT', stop);
  }).catch(() => {
    // Never print connection strings, credentials, raw exceptions or config.
    console.error('物品管理服务未启动，请检查私密环境配置和存储服务');
    process.exitCode = 1;
  });
}
module.exports = { startServer };
