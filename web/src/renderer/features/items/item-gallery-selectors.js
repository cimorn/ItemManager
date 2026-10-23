import { collectDescendantIds, getChildEntries, getItemLocationIds, getNodeLineage, normalizeTagCodes, toText } from '../../lib/project-data';

export function formatCompactPath(path) {
  return toText(path)
    .split('/')
    .map((part) => toText(part))
    .filter(Boolean)
    .join(' · ');
}

export function buildItemCardView(item) {
  const note = toText(item.notes);
  const quantity = toText(item.quantity);
  const metaLine = [item.brand, item.specification, quantity === '1' ? '' : quantity].map(toText).filter(Boolean).join(' · ');
  const locationLine = [...new Set((item.locationPaths || [item.locationPath]).map(formatCompactPath).filter(Boolean))].join('；') || '未设置位置';

  return {
    ...item,
    title: toText(item.name) || '未命名物品',
    note,
    metaLine,
    locationLine,
    tags: normalizeTagCodes(item.tags),
    imageSrc: ''
  };
}

export function sortItemGalleryItems(items = [], sort = '') {
  if (sort !== 'created-desc' && sort !== 'updated-desc') return items;
  const timestamp = (value) => {
    if (value === null || value === undefined || value === '') return -Infinity;
    const parsed = typeof value === 'number' ? value : Date.parse(value);
    return Number.isFinite(parsed) ? parsed : -Infinity;
  };
  const dateFor = (item) => {
    const created = timestamp(item.createdAt);
    const updated = timestamp(item.updatedAt);
    return sort === 'updated-desc' && updated !== -Infinity ? updated : created;
  };
  return items.map((item, index) => ({ item, index, date: dateFor(item) }))
    .sort((left, right) => right.date - left.date || left.index - right.index)
    .map(({ item }) => item);
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
    if (filters.packaging === 'packaged' && item.isPackaged !== true) return false;
    if (filters.packaging === 'unpackaged' && item.isPackaged === true) return false;
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
      if (!getItemLocationIds(item).some(id => locationIds.has(id))) {
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

    return [item.name, item.notes, item.brand, item.specification, item.barcode, item.code, item.imagePath, item.categoryPath, item.locationPath, ...(item.locationPaths || []), ...normalizeTagCodes(item.tags)]
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
