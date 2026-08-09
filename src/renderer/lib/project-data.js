export const MAX_LEVELS = {
  category: 2,
  location: 3
};

const DEFAULT_CATALOG_NAMES = {
  category: {
    1: '\u65b0\u5206\u7c7b',
    2: '\u65b0\u5b50\u5206\u7c7b'
  },
  location: {
    1: '\u65b0\u4f4d\u7f6e',
    2: '\u65b0\u4e8c\u7ea7\u4f4d\u7f6e',
    3: '\u65b0\u4e09\u7ea7\u4f4d\u7f6e'
  }
};

export function toText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

export function normalizeTags(value) {
  const rawTags = Array.isArray(value)
    ? value
    : toText(value)
      .split(/[,\n，、;；|｜]+/g);
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

export function normalizeTagCode(value) {
  const text = toText(value)
    .replace(/[＿_—–\s]+/g, '-')
    .toUpperCase();
  const match = text.match(/^([A-Z]{1,6})-?(\d{1,3})$/);

  if (!match) {
    return text;
  }

  return `${match[1]}-${match[2].padStart(3, '0')}`;
}

export function normalizeTagPrefix(value) {
  const prefix = toText(value)
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase()
    .slice(0, 6);

  return /^[A-Z]{1,6}$/.test(prefix) ? prefix : '';
}

export function normalizeTagCodes(value) {
  const seen = new Set();
  const tags = [];

  for (const rawTag of normalizeTags(value)) {
    const tag = normalizeTagCode(rawTag);
    if (!tag || seen.has(tag)) {
      continue;
    }

    seen.add(tag);
    tags.push(tag);
  }

  return tags;
}

function readTagSerial(tag) {
  const match = normalizeTagCode(tag).match(/^([A-Z]{1,6})-(\d{3})$/);

  if (!match) {
    return null;
  }

  return {
    prefix: match[1],
    number: Number(match[2])
  };
}

export function getNextTagCode(prefix, tags = []) {
  const cleanPrefix = toText(prefix).replace(/[-＿_—–\s]+/g, '').toUpperCase();

  if (!/^[A-Z]{1,6}$/.test(cleanPrefix)) {
    return '';
  }

  const maxNumber = normalizeTagCodes(tags).reduce((max, tag) => {
    const serial = readTagSerial(tag);
    return serial?.prefix === cleanPrefix ? Math.max(max, serial.number) : max;
  }, 0);

  return `${cleanPrefix}-${String(maxNumber + 1).padStart(3, '0')}`;
}

export function getNextTagSuggestions(tags = [], limit = 4, preferredPrefix = '') {
  const prefixStats = new Map();
  const cleanPreferredPrefix = normalizeTagPrefix(preferredPrefix);

  for (const tag of normalizeTagCodes(tags)) {
    const serial = readTagSerial(tag);
    if (!serial) {
      continue;
    }

    const stats = prefixStats.get(serial.prefix) || {
      prefix: serial.prefix,
      maxNumber: 0,
      count: 0
    };

    stats.maxNumber = Math.max(stats.maxNumber, serial.number);
    stats.count += 1;
    prefixStats.set(serial.prefix, stats);
  }

  const suggestions = [...prefixStats.values()]
    .sort((left, right) => right.count - left.count || left.prefix.localeCompare(right.prefix))
    .map((stats) => ({
      prefix: stats.prefix,
      tag: `${stats.prefix}-${String(stats.maxNumber + 1).padStart(3, '0')}`,
      count: stats.count
    }));

  if (cleanPreferredPrefix) {
    const preferredStats = prefixStats.get(cleanPreferredPrefix);
    const preferredSuggestion = {
      prefix: cleanPreferredPrefix,
      tag: getNextTagCode(cleanPreferredPrefix, tags),
      count: preferredStats?.count || 0
    };

    return [
      preferredSuggestion,
      ...suggestions.filter((suggestion) => suggestion.prefix !== cleanPreferredPrefix)
    ].slice(0, limit);
  }

  if (!suggestions.length) {
    return [{ prefix: 'YF', tag: 'YF-001', count: 0 }];
  }

  return suggestions.slice(0, limit);
}

export function completeSmartTagInput(input, tags = []) {
  const text = toText(input);
  const prefixMatch = text.toUpperCase().match(/^([A-Z]{1,6})[-＿_—–\s]*$/);

  if (prefixMatch) {
    return getNextTagCode(prefixMatch[1], tags);
  }

  return normalizeTagCode(text);
}

export function buildTagSummaries(items = []) {
  const summaries = new Map();

  for (const item of items) {
    for (const tag of normalizeTagCodes(item.tags)) {
      const summary = summaries.get(tag) || {
        tag,
        count: 0,
        itemNames: []
      };

      summary.count += 1;
      if (item.name) {
        summary.itemNames.push(item.name);
      }
      summaries.set(tag, summary);
    }
  }

  return [...summaries.values()].sort((left, right) => left.tag.localeCompare(right.tag, 'zh-CN'));
}

export function createLocalId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function buildNodeMaps(entries = []) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const childrenByParent = new Map();

  for (const entry of entries) {
    const key = entry.parentId || 'root';
    const items = childrenByParent.get(key) || [];
    items.push(entry);
    childrenByParent.set(key, items);
  }

  return { byId, childrenByParent };
}

export function buildNodePath(entries = [], nodeId) {
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

export function buildTree(entries = []) {
  const { childrenByParent } = buildNodeMaps(entries);

  function visit(parentId = null) {
    const nodes = childrenByParent.get(parentId || 'root') || [];
    return nodes
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
      .map((entry) => ({
        ...entry,
        children: visit(entry.id)
      }));
  }

  return visit(null);
}

export function buildLeafEntries(entries = []) {
  const { childrenByParent } = buildNodeMaps(entries);
  return entries.filter((entry) => !(childrenByParent.get(entry.id) || []).length);
}

export function getChildEntries(entries = [], parentId = null) {
  const { childrenByParent } = buildNodeMaps(entries);
  return (childrenByParent.get(parentId || 'root') || [])
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
}

export function getNodeLineage(entries = [], nodeId) {
  const { byId } = buildNodeMaps(entries);
  const lineage = [];
  let current = nodeId ? byId.get(nodeId) || null : null;

  while (current) {
    lineage.unshift(current);
    current = current.parentId ? byId.get(current.parentId) || null : null;
  }

  return lineage;
}

export function normalizeTagPrefixes(value = {}) {
  return Object.fromEntries(
    Object.entries(value || {})
      .map(([categoryId, prefix]) => [toText(categoryId), normalizeTagPrefix(prefix)])
      .filter(([categoryId, prefix]) => categoryId && prefix)
  );
}

export function getTagPrefixForCategory(categoryId, categories = [], tagPrefixes = {}) {
  const prefixes = normalizeTagPrefixes(tagPrefixes);
  const lineage = getNodeLineage(categories, categoryId);

  for (const node of lineage.slice().reverse()) {
    const prefix = prefixes[node.id];
    if (prefix) {
      return prefix;
    }
  }

  return '';
}

export function collectDescendantIds(entries = [], nodeId) {
  const { childrenByParent } = buildNodeMaps(entries);
  const result = new Set();

  function walk(currentId) {
    result.add(currentId);
    const children = childrenByParent.get(currentId) || [];
    children.forEach((child) => walk(child.id));
  }

  walk(nodeId);
  return result;
}

export function sanitizeProject(project) {
  if (!project) {
    return null;
  }

  const categories = (project.categories || []).map((entry) => ({
    id: entry.id,
    name: toText(entry.name),
    level: Number(entry.level),
    parentId: entry.parentId || null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  }));
  const locations = (project.locations || []).map((entry) => ({
    id: entry.id,
    name: toText(entry.name),
    level: Number(entry.level),
    parentId: entry.parentId || null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  }));
  const items = (project.items || []).map((item) => {
    const barcode = toText(item.barcode || item.code);

    return {
      id: item.id || createLocalId('item'),
      barcode,
      code: barcode,
      name: toText(item.name),
      brand: toText(item.brand),
      categoryId: item.categoryId || null,
      categoryPath: '',
      locationId: item.locationId || null,
      locationPath: '',
      imagePath: toText(item.imagePath),
      quantity: toText(item.quantity),
      specification: toText(item.specification),
      notes: toText(item.notes),
      tags: normalizeTagCodes(item.tags)
    };
  });

  const nextProject = {
    ...project,
    meta: {
      ...(project.meta || {}),
      tagPrefixes: normalizeTagPrefixes(project.meta?.tagPrefixes)
    },
    categories,
    locations,
    items
  };

  return syncProjectItems(nextProject);
}

export function syncProjectItems(project) {
  const categories = project.categories || [];
  const locations = project.locations || [];

  return {
    ...project,
    items: (project.items || []).map((item) => ({
      ...item,
      categoryPath: item.categoryId ? buildNodePath(categories, item.categoryId) : '',
      locationPath: item.locationId ? buildNodePath(locations, item.locationId) : ''
    }))
  };
}

export function getDefaultCatalogNodeName(mode, level) {
  return DEFAULT_CATALOG_NAMES[mode]?.[level] || '\u65b0\u8282\u70b9';
}

export function hasSiblingCatalogName(entries = [], nodeId, parentId = null, name = '') {
  const cleanName = toText(name);
  const cleanParentId = parentId || null;

  if (!cleanName) {
    return false;
  }

  return entries.some(
    (entry) =>
      entry.id !== nodeId &&
      (entry.parentId || null) === cleanParentId &&
      toText(entry.name) === cleanName
  );
}

export function getUniqueCatalogNodeName(entries = [], mode, level, parentId = null) {
  const baseName = getDefaultCatalogNodeName(mode, level);
  let candidate = baseName;
  let index = 2;

  while (hasSiblingCatalogName(entries, null, parentId, candidate)) {
    candidate = `${baseName} ${index}`;
    index += 1;
  }

  return candidate;
}

export function createCatalogNode(mode, level, parentId = null, name = '') {
  const prefix = mode === 'category' ? 'cat' : 'loc';

  return {
    id: createLocalId(prefix),
    name: toText(name),
    level,
    parentId: parentId || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function canAddChild(mode, node) {
  return Boolean(node && node.level < MAX_LEVELS[mode]);
}

export function getParentOptions(entries = [], mode, node) {
  if (!node || node.level === 1) {
    return [];
  }

  return entries
    .filter((entry) => entry.level === node.level - 1)
    .map((entry) => ({
      id: entry.id,
      label: buildNodePath(entries, entry.id)
    }));
}

export function getCatalogValidation(entries = [], node, mode) {
  if (!node) {
    return [];
  }

  const messages = [];

  if (!toText(node.name)) {
    messages.push('名称不能为空');
  }

  const duplicate = entries.some(
    (entry) =>
      entry.id !== node.id &&
      entry.parentId === node.parentId &&
      toText(entry.name) &&
      toText(entry.name) === toText(node.name)
  );

  if (duplicate) {
    messages.push('当前名称与同级节点重复');
  }

  messages.push('同一父级下名称不能重复');

  if (mode === 'category') {
    messages.push('分类最多支持二级');
  } else {
    messages.push('最多支持三级位置');
  }

  return messages;
}
