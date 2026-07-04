const XLSX = require('xlsx');

const { buildNodeMaps, buildNodePath } = require('../project/project-schema');

function toText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function formatTags(tags) {
  return (Array.isArray(tags) ? tags : [])
    .map((tag) => toText(tag))
    .filter(Boolean)
    .join(', ');
}

function splitPath(path, maxDepth = 3) {
  const values = toText(path)
    .split('/')
    .map((part) => toText(part))
    .slice(0, maxDepth);

  while (values.length < maxDepth) {
    values.push('');
  }

  return values;
}

function buildCategoryRows(categories = []) {
  const { childrenByParent } = buildNodeMaps(categories);
  const leafNodes = categories.filter((entry) => !(childrenByParent.get(entry.id) || []).length);

  return leafNodes.map((entry) => {
    const [level1Name, level2Name] = splitPath(buildNodePath(categories, entry.id), 2);

    return {
      一级分类: level1Name,
      二级分类: level2Name
    };
  });
}

function buildLocationRows(locations = []) {
  const { childrenByParent } = buildNodeMaps(locations);
  const leafNodes = locations.filter((entry) => !(childrenByParent.get(entry.id) || []).length);
  return leafNodes.map((entry) => {
    const [level1Name, level2Name, level3Name] = splitPath(buildNodePath(locations, entry.id), 3);

    return {
      一级位置: level1Name,
      二级位置: level2Name,
      三级位置: level3Name
    };
  });
}

function buildItemRows(items = []) {
  return items.map((item) => ({
    编码: item.code || '',
    名称: item.name || '',
    品牌: item.brand || '',
    分类路径: item.categoryPath || '',
    位置路径: item.locationPath || '',
    图片路径: item.imagePath || '',
    数量: item.quantity || '',
    规格: item.specification || '',
    备注: item.notes || '',
    标签: formatTags(item.tags)
  }));
}

function buildWorkbook(project) {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildCategoryRows(project.categories)), '分类');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildLocationRows(project.locations)), '位置');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildItemRows(project.items)), '物品');

  return workbook;
}

module.exports = { buildWorkbook };
