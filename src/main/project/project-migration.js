const { buildNodePath, createId, createTreeNode, nowIso } = require('./project-schema');

function toText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function normalizeTags(value) {
  const rawTags = Array.isArray(value)
    ? value
    : toText(value).split(/[,\n，、;；|｜]+/g);
  const seen = new Set();
  const tags = [];

  for (const rawTag of rawTags) {
    const tag = toText(rawTag);
    if (!tag || seen.has(tag)) {
      continue;
    }

    seen.add(tag);
    tags.push(tag);
  }

  return tags;
}

function normalizeTagPrefix(value) {
  const prefix = toText(value)
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase()
    .slice(0, 6);

  return /^[A-Z]{1,6}$/.test(prefix) ? prefix : '';
}

function normalizeTagPrefixes(value = {}) {
  return Object.fromEntries(
    Object.entries(value || {})
      .map(([categoryId, prefix]) => [toText(categoryId), normalizeTagPrefix(prefix)])
      .filter(([categoryId, prefix]) => categoryId && prefix)
  );
}

function normalizeMeta(meta = {}) {
  const timestamp = nowIso();

  return {
    name: meta.name || '未命名项目',
    createdAt: meta.createdAt || timestamp,
    updatedAt: meta.updatedAt || meta.createdAt || timestamp,
    appVersion: meta.appVersion || '26.03.30',
    recentImports: Array.isArray(meta.recentImports) ? meta.recentImports : [],
    recentExports: Array.isArray(meta.recentExports) ? meta.recentExports : [],
    tagPrefixes: normalizeTagPrefixes(meta.tagPrefixes)
  };
}

function parsePathSegments(value) {
  return toText(value)
    .split('/')
    .map((entry) => toText(entry))
    .filter(Boolean);
}

function createNodesFromPaths(entries = [], type) {
  const maxLevel = type === 'category' ? 2 : 3;
  const prefix = type === 'category' ? 'cat' : 'loc';
  const map = new Map();
  const nodes = [];

  function ensureNode(name, level, parentId, leafId) {
    const key = `${parentId || 'root'}::${name}`;
    if (map.has(key)) {
      return map.get(key);
    }

    const node = createTreeNode({
      prefix,
      id: leafId,
      name,
      level,
      parentId
    });

    map.set(key, node);
    nodes.push(node);
    return node;
  }

  for (const entry of entries) {
    const rawPath =
      entry.path ||
      [entry.level1Name, entry.level2Name, entry.level3Name]
        .map((item) => toText(item))
        .filter(Boolean)
        .join(' / ') ||
      entry.name;
    const segments = parsePathSegments(rawPath).slice(0, maxLevel);
    let parentId = null;

    segments.forEach((segment, index) => {
      const isLeaf = index === segments.length - 1;
      const node = ensureNode(segment, index + 1, parentId, isLeaf ? entry.id || entry._id : undefined);
      parentId = node.id;
    });
  }

  return nodes;
}

function normalizeTreeEntries(entries = [], type) {
  if (!entries.length) {
    return [];
  }

  const hasTreeShape = entries.every((entry) => entry && Number.isFinite(entry.level));
  const rawNodes = hasTreeShape ? entries : createNodesFromPaths(entries, type);
  const prefix = type === 'category' ? 'cat' : 'loc';

  return rawNodes.map((entry) => ({
    id: entry.id || entry._id || createId(prefix),
    name: toText(entry.name),
    level: Number(entry.level),
    parentId: entry.parentId || null,
    createdAt: entry.createdAt || nowIso(),
    updatedAt: entry.updatedAt || entry.createdAt || nowIso()
  }));
}

function buildPathMap(entries = []) {
  return new Map(entries.map((entry) => [buildNodePath(entries, entry.id), entry]));
}

function normalizeItems(items = [], categories = [], locations = []) {
  const categoriesByPath = buildPathMap(categories);
  const locationsByPath = buildPathMap(locations);

  return items.map((item) => {
    const categoryFromPath = categoriesByPath.get(toText(item.categoryPath)) || null;
    const locationFromPath = locationsByPath.get(toText(item.locationPath)) || null;
    const categoryId = item.categoryId || categoryFromPath?.id || null;
    const locationId = item.locationId || locationFromPath?.id || null;

    return {
      id: item.id || item._id || createId('item'),
      code: toText(item.code),
      name: toText(item.name),
      brand: toText(item.brand),
      categoryId,
      categoryPath: categoryId ? buildNodePath(categories, categoryId) : toText(item.categoryPath),
      locationId,
      locationPath: locationId ? buildNodePath(locations, locationId) : toText(item.locationPath),
      imagePath: toText(item.imagePath || item.image || item.imageUrl),
      quantity: toText(item.quantity),
      specification: toText(item.specification || item.spec),
      notes: toText(item.notes),
      tags: normalizeTags(item.tags)
    };
  });
}

function migrateProjectData(project) {
  const categories = normalizeTreeEntries(project.categories, 'category');
  const locations = normalizeTreeEntries(project.locations, 'location');
  const items = normalizeItems(project.items, categories, locations);

  return {
    meta: normalizeMeta(project.meta),
    categories,
    locations,
    items
  };
}

module.exports = {
  buildPathMap,
  migrateProjectData,
  normalizeItems,
  normalizeMeta,
  normalizeTagPrefixes,
  normalizeTags,
  normalizeTreeEntries
};
