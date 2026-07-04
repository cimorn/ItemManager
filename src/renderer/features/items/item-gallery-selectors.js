import { collectDescendantIds, getChildEntries, getNodeLineage, normalizeTagCodes, toText } from '../../lib/project-data';

function normalizeRelativePath(path) {
  return toText(path).replace(/\\/g, '/').replace(/^\/+/, '');
}

export function buildPreviewSrc(projectDir, imagePath) {
  const root = toText(projectDir).replace(/\\/g, '/').replace(/\/+$/, '');
  const relativePath = normalizeRelativePath(imagePath);

  if (!root || !relativePath) {
    return '';
  }

  return encodeURI(`file:///${root}/${relativePath}`);
}

export function formatCompactPath(path) {
  return toText(path)
    .split('/')
    .map((part) => toText(part))
    .filter(Boolean)
    .join(' · ');
}

export function buildItemCardView(item, projectDir) {
  const note = toText(item.notes);
  const metaLine = [item.brand, item.specification, item.quantity].map(toText).filter(Boolean).join(' · ');
  const locationLine = formatCompactPath(item.locationPath) || '未设置位置';

  return {
    ...item,
    title: toText(item.name) || '未命名物品',
    note,
    metaLine,
    locationLine,
    tags: normalizeTagCodes(item.tags),
    imageSrc: buildPreviewSrc(projectDir, item.imagePath)
  };
}

export function createEmptyItemDraft(categories = [], locations = []) {
  const firstMainCategory = getChildEntries(categories, null)[0] || null;
  const firstSubCategory = firstMainCategory ? getChildEntries(categories, firstMainCategory.id)[0] || null : null;
  const level1Location = getChildEntries(locations, null)[0] || null;
  const level2Location = level1Location ? getChildEntries(locations, level1Location.id)[0] || null : null;
  const level3Location = level2Location ? getChildEntries(locations, level2Location.id)[0] || null : null;

  return {
    barcode: '',
    code: '',
    name: '',
    notes: '',
    brand: '',
    specification: '',
    quantity: '',
    categoryId: firstSubCategory?.id || firstMainCategory?.id || null,
    locationId: level3Location?.id || level2Location?.id || level1Location?.id || null,
    imagePath: '',
    tags: []
  };
}

export function buildTagChips(items = []) {
  const seen = new Set();
  const tagChips = [];

  for (const item of items) {
    for (const tag of normalizeTagCodes(item.tags)) {
      if (seen.has(tag)) {
        continue;
      }

      seen.add(tag);
      tagChips.push({ id: tag, label: tag });
    }
  }

  return tagChips;
}

export function buildFilterGroups(categories = [], locations = [], filters = {}, items = []) {
  const mainCategories = getChildEntries(categories, null).map((entry) => ({
    id: entry.id,
    label: entry.name
  }));
  const subCategories = filters.mainCategoryId
    ? getChildEntries(categories, filters.mainCategoryId).map((entry) => ({
        id: entry.id,
        label: entry.name
      }))
    : [];
  const locationLineage = getNodeLineage(locations, filters.locationId);
  const locationSelection = {
    level1Id: locationLineage[0]?.id || '',
    level2Id: locationLineage[1]?.id || '',
    level3Id: locationLineage[2]?.id || ''
  };
  const locationLevel1Options = getChildEntries(locations, null).map(toFilterOption);
  const locationLevel2Options = locationSelection.level1Id ? getChildEntries(locations, locationSelection.level1Id).map(toFilterOption) : [];
  const locationLevel3Options = locationSelection.level2Id ? getChildEntries(locations, locationSelection.level2Id).map(toFilterOption) : [];

  return {
    mainCategories,
    subCategories,
    locationSelection,
    locationLevels: {
      level1: locationLevel1Options,
      level2: locationLevel2Options,
      level3: locationLevel3Options
    },
    tagChips: buildTagChips(items)
  };
}

export function getLocationRootId(locations = [], locationId) {
  return getNodeLineage(locations, locationId)[0]?.id || '';
}

export function applyItemGalleryFilters(items = [], categories = [], locations = [], filters = {}, search = '') {
  const needle = toText(search).toLowerCase();

  return items.filter((item) => {
    if (filters.mainCategoryId) {
      if (getNodeLineage(categories, item.categoryId)[0]?.id !== filters.mainCategoryId) {
        return false;
      }
    }

    if (filters.subCategoryId) {
      if (item.categoryId !== filters.subCategoryId) {
        return false;
      }
    }

    if (filters.locationId) {
      const locationIds = collectDescendantIds(locations, filters.locationId);
      if (!locationIds.has(item.locationId)) {
        return false;
      }
    }

    if (filters.tag) {
      if (!normalizeTagCodes(item.tags).includes(filters.tag)) {
        return false;
      }
    }

    if (!needle) {
      return true;
    }

    return [item.name, item.notes, item.brand, item.specification, item.barcode, item.code, item.imagePath, item.categoryPath, item.locationPath, ...normalizeTagCodes(item.tags)]
      .map(toText)
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(needle);
  });
}

function toFilterOption(entry) {
  return {
    id: entry.id,
    label: entry.name
  };
}
