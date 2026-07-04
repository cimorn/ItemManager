const XLSX = require('xlsx');

const { buildNodePath, createId, createTreeNode } = require('../project/project-schema');

const REQUIRED_SHEETS = ['分类', '位置', '物品'];

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

function createStableId(prefix, ...parts) {
  const raw = parts.map((entry) => toText(entry)).filter(Boolean).join('|') || `${prefix}|empty`;
  let hash = 0;

  for (const char of raw) {
    hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  }

  return `${prefix}_${hash.toString(36)}`;
}

function readRows(workbook, sheetName) {
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: ''
  });
}

function ensureNode(nodes, map, prefix, name, level, parentId = null) {
  const cleanName = toText(name);
  if (!cleanName) {
    return null;
  }

  const key = `${parentId || 'root'}::${cleanName}`;
  if (map.has(key)) {
    return map.get(key);
  }

  const node = createTreeNode({
    prefix,
    id: createStableId(prefix, parentId || 'root', cleanName),
    name: cleanName,
    level,
    parentId
  });

  map.set(key, node);
  nodes.push(node);
  return node;
}

function buildCategories(rows) {
  const nodes = [];
  const map = new Map();

  for (const row of rows) {
    const level1 = ensureNode(nodes, map, 'cat', row.一级分类, 1, null);
    if (row.二级分类) {
      ensureNode(nodes, map, 'cat', row.二级分类, 2, level1?.id || null);
    }
  }

  return nodes;
}

function buildLocations(rows) {
  const nodes = [];
  const map = new Map();

  for (const row of rows) {
    const level1 = ensureNode(nodes, map, 'loc', row.一级位置, 1, null);
    const level2 = row.二级位置 ? ensureNode(nodes, map, 'loc', row.二级位置, 2, level1?.id || null) : null;
    if (row.三级位置) {
      ensureNode(nodes, map, 'loc', row.三级位置, 3, level2?.id || null);
    }
  }

  return nodes;
}

function ensurePathNodes(nodes, type, rawPath) {
  const segments = toText(rawPath)
    .split('/')
    .map((entry) => toText(entry))
    .filter(Boolean);
  const map = new Map(nodes.map((node) => [`${node.parentId || 'root'}::${node.name}`, node]));
  const prefix = type === 'category' ? 'cat' : 'loc';
  let parentId = null;
  let current = null;

  segments.forEach((segment, index) => {
    current = ensureNode(nodes, map, prefix, segment, index + 1, parentId);
    parentId = current?.id || null;
  });

  return nodes;
}

function buildItems(rows, categories, locations) {
  const categoriesByPath = new Map(categories.map((entry) => [buildNodePath(categories, entry.id), entry]));
  const locationsByPath = new Map(locations.map((entry) => [buildNodePath(locations, entry.id), entry]));

  return rows
    .map((row) => {
      const name = toText(row.名称);
      const categoryPath = toText(row.分类路径);
      const locationPath = toText(row.位置路径);

      if (!name) {
        return null;
      }

      const code =
        toText(row.编码) || createStableId('item-code', name, categoryPath, locationPath, row.品牌, row.规格);
      const category = categoriesByPath.get(categoryPath) || null;
      const location = locationsByPath.get(locationPath) || null;

      return {
        id: createStableId('item', code),
        code,
        name,
        brand: toText(row.品牌),
        categoryId: category?.id || null,
        categoryPath,
        locationId: location?.id || null,
        locationPath,
        imagePath: toText(row.图片路径),
        quantity: toText(row.数量),
        specification: toText(row.规格),
        notes: toText(row.备注),
        tags: normalizeTags(row.标签)
      };
    })
    .filter(Boolean);
}

async function inspectWorkbook(workbook) {
  for (const name of REQUIRED_SHEETS) {
    if (!workbook.SheetNames.includes(name)) {
      throw new Error(`缺少工作表：${name}`);
    }
  }

  const categoryRows = readRows(workbook, '分类');
  const locationRows = readRows(workbook, '位置');
  const itemRows = readRows(workbook, '物品');

  const categories = buildCategories(categoryRows);
  const locations = buildLocations(locationRows);

  itemRows.forEach((row) => ensurePathNodes(categories, 'category', row.分类路径));
  itemRows.forEach((row) => ensurePathNodes(locations, 'location', row.位置路径));

  const items = buildItems(itemRows, categories, locations);

  return {
    preview: {
      categories: categories.length,
      locations: locations.length,
      items: items.length
    },
    data: {
      meta: {
        name: 'Excel 导入',
        source: 'excel'
      },
      categories,
      locations,
      items
    }
  };
}

async function inspectWorkbookFile(filePath) {
  const workbook = XLSX.readFile(filePath);
  return inspectWorkbook(workbook);
}

module.exports = {
  REQUIRED_SHEETS,
  inspectWorkbook,
  inspectWorkbookFile
};
