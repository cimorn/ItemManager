function toText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

const { buildNodePath } = require('../project/project-schema');

function mergeEntriesByPath(currentEntries = [], importedEntries = []) {
  const map = new Map();

  for (const entry of currentEntries) {
    const path = buildNodePath(currentEntries, entry?.id);
    if (path) {
      map.set(path, structuredClone(entry));
    }
  }

  for (const entry of importedEntries) {
    const path = buildNodePath(importedEntries, entry?.id);
    if (!path) {
      continue;
    }

    const existing = map.get(path) || {};
    map.set(path, { ...existing, ...structuredClone(entry) });
  }

  return Array.from(map.values());
}

function itemMergeKey(item) {
  return (
    toText(item?.code) ||
    [item?.name, item?.categoryPath, item?.locationPath]
      .map((entry) => toText(entry))
      .filter(Boolean)
      .join('|')
  );
}

function remapItems(items, categories, locations) {
  const categoriesByPath = new Map(categories.map((entry) => [entry.path, entry]));
  const locationsByPath = new Map(locations.map((entry) => [entry.path, entry]));

  return items.map((item) => {
    const category = categoriesByPath.get(item.categoryPath) || null;
    const location = locationsByPath.get(item.locationPath) || null;

    return {
      ...item,
      categoryId: category?.id || null,
      locationId: location?.id || null
    };
  });
}

function mergeItems(currentItems = [], importedItems = [], categories, locations) {
  const map = new Map();

  for (const item of currentItems) {
    const key = itemMergeKey(item);
    if (key) {
      map.set(key, structuredClone(item));
    }
  }

  for (const item of importedItems) {
    const key = itemMergeKey(item);
    if (!key) {
      continue;
    }

    const existing = map.get(key) || {};
    map.set(key, { ...existing, ...structuredClone(item) });
  }

  return remapItems(Array.from(map.values()), categories, locations);
}

function mergeProjectData({ currentProject, importedProject, mode }) {
  if (mode === 'replace') {
    return importedProject;
  }

  const categories = mergeEntriesByPath(currentProject.categories, importedProject.categories);
  const locations = mergeEntriesByPath(currentProject.locations, importedProject.locations);
  const items = mergeItems(currentProject.items, importedProject.items, categories, locations);

  return {
    ...currentProject,
    categories,
    locations,
    items
  };
}

module.exports = { mergeProjectData };
