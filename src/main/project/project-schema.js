const crypto = require('node:crypto');

const APP_VERSION = '26.03.30';

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function createTreeNode({ prefix, name, level, parentId = null, id }) {
  const timestamp = nowIso();

  return {
    id: id || createId(prefix),
    name,
    level,
    parentId,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function buildNodeMaps(entries = []) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const childrenByParent = new Map();

  for (const entry of entries) {
    const key = entry.parentId || 'root';
    const list = childrenByParent.get(key) || [];
    list.push(entry);
    childrenByParent.set(key, list);
  }

  return { byId, childrenByParent };
}

function buildNodePath(entries = [], nodeId) {
  if (!nodeId) {
    return '';
  }

  const { byId } = buildNodeMaps(entries);
  const names = [];
  let current = byId.get(nodeId) || null;

  while (current) {
    names.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) || null : null;
  }

  return names.join(' / ');
}

function createEmptyProjectData(name) {
  const timestamp = nowIso();

  return {
    meta: {
      name,
      createdAt: timestamp,
      updatedAt: timestamp,
      appVersion: APP_VERSION,
      recentImports: [],
      recentExports: [],
      tagPrefixes: {}
    },
    categories: [],
    locations: [],
    items: []
  };
}

module.exports = {
  APP_VERSION,
  buildNodeMaps,
  buildNodePath,
  createEmptyProjectData,
  createId,
  createTreeNode,
  nowIso
};
