import { create } from 'zustand';
import { applyItemTimestamps } from '../lib/item-timestamps';

import {
  MAX_LEVELS,
  buildNodePath,
  canAddChild,
  collectDescendantIds,
  createLocalId,
  createCatalogNode,
  getUniqueCatalogNodeName,
  getChildEntries,
  getItemLocationIds,
  hasSiblingCatalogName,
  normalizeTagCode,
  normalizeTagCodes,
  normalizeTagPrefix,
  optionalBoolean,
  sanitizeProject,
  reorderCatalogEntries,
  syncProjectItems,
  toText
} from '../lib/project-data';

function cloneValue(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function updateProject(set, get, callback) {
  const currentProject = get().currentProject;
  if (!currentProject || currentProject.privacy?.locked || (currentProject.privacy?.required && !currentProject.privacy?.enabled)) {
    return;
  }

  const draft = cloneValue(currentProject);
  const result = callback(draft) || {};

  if (result.skipUpdate) {
    return;
  }

  const nextProject = applyItemTimestamps(currentProject, syncProjectItems(draft));

  set({
    currentProject: nextProject,
    dirty: true,
    selectedItemId:
      result.selectedItemId !== undefined
        ? result.selectedItemId
        : nextProject.items.find((item) => item.id === get().selectedItemId)?.id || nextProject.items[0]?.id || null,
    selectedCatalogNodeIds: {
      ...get().selectedCatalogNodeIds,
      ...(result.selectedCatalogNodeIds || {})
    }
  });
}

function clearItemReferences(items, nodeIds, key) {
  if (key === 'locationId') return items.map(item => {
    const locationIds = getItemLocationIds(item).filter(id => !nodeIds.has(id));
    return { ...item, locationId: locationIds[0] || null, ...(Object.hasOwn(item, 'locationIds') ? { locationIds } : {}) };
  });
  return items.map((item) =>
    nodeIds.has(item[key])
      ? {
          ...item,
          [key]: null
        }
      : item
  );
}

function applyItemPatch(item, patch = {}, { replaceLocations = false } = {}) {
  const next = { ...item, ...patch, ...optionalBoolean(patch, 'isPackaged') };
  if (!Object.hasOwn(patch, 'locationIds') && Object.hasOwn(patch, 'locationId') && Object.hasOwn(item, 'locationIds') &&
      (replaceLocations || (patch.locationId || null) !== (item.locationId || null))) {
    next.locationIds = patch.locationId ? [patch.locationId] : [];
  }
  return next;
}

function appendCatalogNode(entries, node) {
  const others = entries.filter(entry => entry.id !== node.id);
  const siblings = [...getChildEntries(others, node.parentId), node];
  const ranks = new Map(siblings.map((entry, index) => [entry.id, index]));
  return [...others, node].map(entry => ranks.has(entry.id) ? { ...entry, sortOrder: ranks.get(entry.id) } : entry);
}

function applyBulkTags(currentTags, patch) {
  const tags = normalizeTagCodes(patch?.tags);
  if (!tags.length) {
    return normalizeTagCodes(currentTags);
  }

  if (patch.tagMode === 'replace') {
    return tags;
  }

  if (patch.tagMode === 'remove') {
    const tagsToRemove = new Set(tags);
    return normalizeTagCodes(currentTags).filter((tag) => !tagsToRemove.has(tag));
  }

  return normalizeTagCodes([...normalizeTagCodes(currentTags), ...tags]);
}

function createProjectState(set, get) {
  return {
    currentProject: null,
    dirty: false,
    search: '',
    itemFilters: {
      mainCategoryId: '',
      subCategoryId: '',
      locationId: '',
      tag: ''
    },
    selectedSection: 'items',
    selectedItemId: null,
    selectedCatalogMode: 'category',
    selectedCatalogNodeIds: {
      category: null,
      location: null
    },
    setProject: (project) => {
      const nextProject = sanitizeProject(project);
      const firstCategory = nextProject?.categories?.find((entry) => entry.level === 1)?.id || null;
      const firstLocation = nextProject?.locations?.find((entry) => entry.level === 1)?.id || null;

      set({
        currentProject: nextProject,
        dirty: false,
        search: '',
        itemFilters: {
          mainCategoryId: '',
          subCategoryId: '',
          locationId: '',
          tag: ''
        },
        selectedSection: 'items',
        selectedItemId: nextProject?.items?.[0]?.id || null,
        selectedCatalogMode: 'category',
        selectedCatalogNodeIds: {
          category: firstCategory,
          location: firstLocation
        }
      });
    },
    setSearch: (search) => set({ search }),
    setItemFilters: (patch) =>
      set((state) => {
        const nextFilters = {
          ...state.itemFilters,
          ...patch
        };

        if (Object.prototype.hasOwnProperty.call(patch, 'mainCategoryId')) {
          nextFilters.subCategoryId = '';
        }

        if (Object.prototype.hasOwnProperty.call(patch, 'subCategoryId') && !patch.subCategoryId) {
          nextFilters.subCategoryId = '';
        }

        return {
          itemFilters: nextFilters
        };
      }),
    setSelectedSection: (selectedSection) => set({ selectedSection }),
    setSelectedItemId: (selectedItemId) => set({ selectedItemId }),
    setSelectedCatalogMode: (selectedCatalogMode) => set({ selectedCatalogMode }),
    selectCatalogNode: (mode, nodeId) =>
      set({
        selectedCatalogMode: mode,
        selectedCatalogNodeIds: {
          ...get().selectedCatalogNodeIds,
          [mode]: nodeId
        }
      }),
    createItemFromDraft: (draft) =>
      updateProject(set, get, (project) => {
        const nextItem = {
          id: createLocalId('item'),
          barcode: toText(draft?.barcode || draft?.code),
          code: toText(draft?.barcode || draft?.code),
          name: toText(draft?.name),
          brand: toText(draft?.brand),
          categoryId: draft?.categoryId || null,
          categoryPath: '',
          locationId: draft?.locationId || null,
          ...(Object.hasOwn(draft || {}, 'locationIds') ? { locationIds: getItemLocationIds(draft) } : {}),
          ...optionalBoolean(draft || {}, 'isPackaged'),
          locationPath: '',
          imagePath: toText(draft?.imagePath),
          quantity: toText(draft?.quantity),
          specification: toText(draft?.specification),
          notes: toText(draft?.notes),
          isPrivate: Boolean(draft?.isPrivate),
          tags: normalizeTagCodes(draft?.tags)
        };

        project.items.push(nextItem);
        return { selectedItemId: nextItem.id };
      }),
    updateItem: (itemId, patch) =>
      updateProject(set, get, (project) => {
        project.items = project.items.map((item) => (item.id === itemId ? applyItemPatch(item, patch) : item));
      }),
    saveItem: (itemId, draft) =>
      updateProject(set, get, (project) => {
        project.items = project.items.map((item) =>
          item.id === itemId
            ? {
                ...applyItemPatch(item, draft),
                barcode: toText(draft?.barcode || draft?.code),
                code: toText(draft?.barcode || draft?.code),
                name: toText(draft?.name),
                notes: toText(draft?.notes),
                brand: toText(draft?.brand),
                specification: toText(draft?.specification),
                quantity: toText(draft?.quantity),
                imagePath: toText(draft?.imagePath),
                tags: normalizeTagCodes(draft?.tags),
                categoryId: draft?.categoryId || null,
                locationId: Object.hasOwn(draft || {}, 'locationId') ? draft.locationId || null : item.locationId
              }
            : item
        );
      }),
    bulkUpdateItems: (itemIds, patch = {}) => {
      const selectedIds = new Set(Array.isArray(itemIds) ? itemIds.filter(Boolean) : []);
      if (!selectedIds.size) {
        return 0;
      }

      let changedCount = 0;

      updateProject(set, get, (project) => {
        project.items = project.items.map((item) => {
          if (!selectedIds.has(item.id)) {
            return item;
          }

          changedCount += 1;
          const nextItem = applyItemPatch(item, {
            ...(Object.hasOwn(patch, 'locationIds') ? { locationIds: patch.locationIds } : {}),
            ...(Object.hasOwn(patch, 'locationId') ? { locationId: patch.locationId } : {}),
            ...optionalBoolean(patch, 'isPackaged')
          }, { replaceLocations: true });

          if (Object.prototype.hasOwnProperty.call(patch, 'categoryId')) {
            nextItem.categoryId = patch.categoryId || null;
          }

          if (Object.prototype.hasOwnProperty.call(patch, 'locationId')) {
            nextItem.locationId = patch.locationId || null;
          }

          if (normalizeTagCodes(patch.tags).length) {
            nextItem.tags = applyBulkTags(item.tags, patch);
          }

          return nextItem;
        });

        return { selectedItemId: itemIds[0] || get().selectedItemId };
      });

      return changedCount;
    },
    deleteItem: (itemId) =>
      updateProject(set, get, (project) => {
        const index = project.items.findIndex((item) => item.id === itemId);
        project.items = project.items.filter((item) => item.id !== itemId);

        return {
          selectedItemId: project.items[index]?.id || project.items[Math.max(index - 1, 0)]?.id || null
        };
      }),
    deleteTags: (tags) => {
      const cleanTags = new Set(normalizeTagCodes(tags));

      if (!cleanTags.size) {
        return;
      }

      updateProject(set, get, (project) => {
        project.items = project.items.map((item) => ({
          ...item,
          tags: normalizeTagCodes(item.tags).filter((itemTag) => !cleanTags.has(itemTag))
        }));
      });

      set((state) => ({
        itemFilters: cleanTags.has(state.itemFilters.tag)
          ? {
              ...state.itemFilters,
              tag: ''
            }
          : state.itemFilters
      }));
    },
    deleteTag: (tag) => {
      get().deleteTags([tag]);
    },
    renameTag: (fromTag, toTag) => {
      const cleanFromTag = normalizeTagCode(fromTag);
      const cleanToTag = normalizeTagCode(toTag);

      if (!cleanFromTag || !cleanToTag || cleanFromTag === cleanToTag) {
        return;
      }

      updateProject(set, get, (project) => {
        project.items = project.items.map((item) => ({
          ...item,
          tags: normalizeTagCodes(normalizeTagCodes(item.tags).map((itemTag) => (itemTag === cleanFromTag ? cleanToTag : itemTag)))
        }));
      });

      set((state) => ({
        itemFilters:
          state.itemFilters.tag === cleanFromTag
            ? {
                ...state.itemFilters,
                tag: cleanToTag
              }
            : state.itemFilters
      }));
    },
    updateTagPrefix: (categoryId, prefix) =>
      updateProject(set, get, (project) => {
        const cleanCategoryId = toText(categoryId);
        if (!cleanCategoryId) {
          return {};
        }

        const cleanPrefix = normalizeTagPrefix(prefix);
        const tagPrefixes = {
          ...(project.meta?.tagPrefixes || {})
        };

        if (cleanPrefix) {
          tagPrefixes[cleanCategoryId] = cleanPrefix;
        } else {
          delete tagPrefixes[cleanCategoryId];
        }

        project.meta = {
          ...(project.meta || {}),
          tagPrefixes
        };
      }),
    addCatalogRoot: (mode, name = '', options = {}) =>
      updateProject(set, get, (project) => {
        const key = mode === 'category' ? 'categories' : 'locations';
        const nextName = toText(name) || getUniqueCatalogNodeName(project[key], mode, 1, null);

        if (hasSiblingCatalogName(project[key], null, null, nextName)) {
          return { skipUpdate: true };
        }

        const nextNode = createCatalogNode(mode, 1, null, nextName, options);
        project[key] = appendCatalogNode(project[key], nextNode);

        return {
          selectedCatalogNodeIds: { [mode]: nextNode.id }
        };
      }),
    addCatalogSibling: (mode, name = '', options = {}) =>
      updateProject(set, get, (project) => {
        const key = mode === 'category' ? 'categories' : 'locations';
        const selectedNodeId = get().selectedCatalogNodeIds[mode];
        const selectedNode = project[key].find((entry) => entry.id === selectedNodeId) || null;
        const level = selectedNode?.level || 1;
        const parentId = selectedNode?.parentId || null;
        const nextName = toText(name) || getUniqueCatalogNodeName(project[key], mode, level, parentId);

        if (hasSiblingCatalogName(project[key], null, parentId, nextName)) {
          return { skipUpdate: true };
        }

        const nextNode = createCatalogNode(mode, level, parentId, nextName, options);
        project[key] = appendCatalogNode(project[key], nextNode);

        return {
          selectedCatalogNodeIds: { [mode]: nextNode.id }
        };
      }),
    addCatalogChild: (mode, name = '', options = {}) =>
      updateProject(set, get, (project) => {
        const key = mode === 'category' ? 'categories' : 'locations';
        const selectedNodeId = get().selectedCatalogNodeIds[mode];
        const selectedNode = project[key].find((entry) => entry.id === selectedNodeId) || null;
        if (!canAddChild(mode, selectedNode)) {
          return {};
        }

        const level = selectedNode.level + 1;
        const nextName = toText(name) || getUniqueCatalogNodeName(project[key], mode, level, selectedNode.id);

        if (hasSiblingCatalogName(project[key], null, selectedNode.id, nextName)) {
          return { skipUpdate: true };
        }

        const nextNode = createCatalogNode(mode, level, selectedNode.id, nextName, options);
        project[key] = appendCatalogNode(project[key], nextNode);

        return {
          selectedCatalogNodeIds: { [mode]: nextNode.id }
        };
      }),
    reorderCatalogNode: (mode, nodeId, targetId, position = 'before') =>
      updateProject(set, get, (project) => {
        if (!['category', 'location'].includes(mode)) return { skipUpdate: true };
        const key = mode === 'category' ? 'categories' : 'locations';
        const reordered = reorderCatalogEntries(project[key], nodeId, targetId, position);
        if (reordered === project[key]) return { skipUpdate: true };
        project[key] = reordered;
      }),
    updateCatalogNode: (mode, nodeId, patch = {}) =>
      updateProject(set, get, (project) => {
        const key = mode === 'category' ? 'categories' : 'locations';
        const currentEntry = project[key].find((entry) => entry.id === nodeId) || null;

        if (!currentEntry) {
          return { skipUpdate: true };
        }

        const patchHasName = Object.prototype.hasOwnProperty.call(patch, 'name');
        const patchHasParentId = Object.prototype.hasOwnProperty.call(patch, 'parentId');
        const nextName = patchHasName ? toText(patch.name) : currentEntry.name;
        const nextParentId = currentEntry.level === 1 ? null : patchHasParentId ? patch.parentId || null : currentEntry.parentId || null;

        if (hasSiblingCatalogName(project[key], nodeId, nextParentId, nextName)) {
          return { skipUpdate: true };
        }

        project[key] = project[key].map((entry) =>
          entry.id === nodeId
            ? {
                ...entry,
                ...patch,
                ...optionalBoolean(patch, 'isPrivate'),
                name: nextName,
                parentId: nextParentId,
                updatedAt: new Date().toISOString()
              }
            : entry
        );
        if ((currentEntry.parentId || null) !== nextParentId) {
          project[key] = appendCatalogNode(project[key], project[key].find(entry => entry.id === nodeId));
        }
      }),
    deleteCatalogNode: (mode) =>
      updateProject(set, get, (project) => {
        const key = mode === 'category' ? 'categories' : 'locations';
        const selectedNodeId = get().selectedCatalogNodeIds[mode];
        if (!selectedNodeId) {
          return {};
        }

        const ids = collectDescendantIds(project[key], selectedNodeId);
        project[key] = project[key].filter((entry) => !ids.has(entry.id));

        if (mode === 'category') {
          project.items = clearItemReferences(project.items, ids, 'categoryId');
        } else {
          project.items = clearItemReferences(project.items, ids, 'locationId');
        }

        return {
          selectedCatalogNodeIds: {
            [mode]: project[key][0]?.id || null
          }
        };
      }),
    getVisibleItems: () => {
      const { currentProject, search } = get();
      if (!currentProject) {
        return [];
      }

      const needle = toText(search).toLowerCase();
      if (!needle) {
        return currentProject.items || [];
      }

      return (currentProject.items || []).filter((item) =>
        [item.name, item.brand, item.notes, item.barcode, item.code, item.categoryPath, item.locationPath, ...(item.locationPaths || []), ...(item.tags || [])]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle)
      );
    },
  };
}

export const createProjectStore = () => create(createProjectState);
export const useProjectStore = createProjectStore();
