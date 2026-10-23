'use strict';

const TEXT_FIELDS = ['barcode', 'code', 'name', 'brand', 'quantity', 'specification', 'notes', 'categoryId', 'imagePath'];

function itemContent(item) {
  // Derived paths and catalog ordering are not item edits. Location order is
  // meaningful (the first location is primary), while tag order is not.
  const locations = Array.isArray(item.locationIds) ? item.locationIds : item.locationId ? [item.locationId] : [];
  return JSON.stringify([
    ...TEXT_FIELDS.map(field => String(item[field] ?? '')),
    [...new Set(locations)],
    item.isPackaged === true,
    item.isPrivate === true,
    [...new Set(item.tags || [])].sort()
  ]);
}

function applyItemTimestamps(previousProject, nextProject, now = new Date()) {
  const timestamp = new Date(now).toISOString();
  const previousItems = new Map((previousProject?.items || []).map(item => [item.id, item]));
  return {
    ...nextProject,
    items: (nextProject.items || []).map(item => {
      const previous = previousItems.get(item.id);
      if (!previous) return { ...item, createdAt: timestamp, updatedAt: timestamp };

      const next = { ...item };
      // Existing dates are authoritative, including their absence in legacy
      // records. Older clients may omit them; clients cannot rewrite history.
      for (const field of ['createdAt', 'updatedAt']) {
        if (previous[field] != null) next[field] = previous[field];
        else delete next[field];
      }
      if (itemContent(previous) !== itemContent(item)) next.updatedAt = timestamp;
      return next;
    })
  };
}

module.exports = { applyItemTimestamps };
