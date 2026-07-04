const { buildNodeMaps, buildNodePath } = require('./project-schema');

function siblingDuplicate(entries, entry) {
  return entries.some(
    (candidate) =>
      candidate.id !== entry.id && candidate.parentId === entry.parentId && candidate.name.trim() === entry.name.trim()
  );
}

function validateProjectData(project) {
  const categories = project.categories || [];
  const locations = project.locations || [];
  const categoryIds = new Set(categories.map((entry) => entry.id));
  const locationIds = new Set(locations.map((entry) => entry.id));
  const errors = [];
  const warnings = [];
  const { byId: categoryById } = buildNodeMaps(categories);
  const { byId: locationById } = buildNodeMaps(locations);

  for (const entry of categories) {
    if (!entry.name?.trim()) {
      warnings.push({ level: 'warning', message: `存在未命名分类：${entry.id}` });
    }

    if (entry.level < 1 || entry.level > 2) {
      errors.push({ level: 'error', message: `分类层级非法：${entry.name || entry.id}` });
    }

    if (entry.level === 1 && entry.parentId) {
      errors.push({ level: 'error', message: `一级分类不能有父级：${entry.name}` });
    }

    if (entry.level === 2 && !categoryById.get(entry.parentId || '')) {
      errors.push({ level: 'error', message: `二级分类缺少父级：${entry.name}` });
    }

    if (siblingDuplicate(categories, entry)) {
      errors.push({ level: 'error', message: `同一父级下分类重复：${buildNodePath(categories, entry.id)}` });
    }
  }

  for (const entry of locations) {
    if (!entry.name?.trim()) {
      warnings.push({ level: 'warning', message: `存在未命名位置：${entry.id}` });
    }

    if (entry.level < 1 || entry.level > 3) {
      errors.push({ level: 'error', message: `位置层级非法：${entry.name || entry.id}` });
    }

    if (entry.level === 1 && entry.parentId) {
      errors.push({ level: 'error', message: `一级位置不能有父级：${entry.name}` });
    }

    if (entry.level > 1 && !locationById.get(entry.parentId || '')) {
      errors.push({ level: 'error', message: `位置缺少父级：${entry.name}` });
    }

    if (siblingDuplicate(locations, entry)) {
      errors.push({ level: 'error', message: `同一父级下位置重复：${buildNodePath(locations, entry.id)}` });
    }
  }

  for (const item of project.items || []) {
    if (item.categoryId && !categoryIds.has(item.categoryId)) {
      errors.push({ level: 'error', message: `分类不存在：${item.categoryId}` });
    }

    if (item.locationId && !locationIds.has(item.locationId)) {
      errors.push({ level: 'error', message: `位置不存在：${item.locationId}` });
    }

    if (!item.name) {
      warnings.push({ level: 'warning', message: `存在未命名物品：${item.id || 'unknown'}` });
    }

    if (item.imagePath && !item.imagePath.startsWith('images/')) {
      warnings.push({ level: 'warning', message: `图片路径建议使用 images/分类/子分类/文件名：${item.name || item.id}` });
    }
  }

  return { errors, warnings };
}

module.exports = { validateProjectData };
