import { describe, expect, it } from 'vitest';

import { createProjectStore } from '../../src/renderer/store/project-store';

const NEW_CATEGORY = '\u65b0\u5206\u7c7b';
const NEW_SUBCATEGORY = '\u65b0\u5b50\u5206\u7c7b';
const NEW_LOCATION = '\u65b0\u4f4d\u7f6e';

const baseProject = {
  meta: { name: 'catalog test' },
  paths: { projectDir: 'C:/data' },
  categories: [
    { id: 'cat_clothes', name: 'Clothes', level: 1, parentId: null },
    { id: 'cat_shoes', name: 'Shoes', level: 2, parentId: 'cat_clothes' },
    { id: 'cat_digital', name: 'Digital', level: 1, parentId: null }
  ],
  locations: [
    { id: 'loc_home', name: 'Home', level: 1, parentId: null },
    { id: 'loc_box', name: 'Box', level: 2, parentId: 'loc_home' },
    { id: 'loc_shelf', name: 'Shelf', level: 2, parentId: 'loc_home' }
  ],
  items: []
};

function createLoadedStore(project = baseProject) {
  const store = createProjectStore();
  store.getState().setProject(project);
  return store;
}

function findEntry(store, key, id) {
  return store.getState().currentProject[key].find((entry) => entry.id === id);
}

describe('catalog duplicate handling', () => {
  it('prevents category siblings from being renamed to the same name', () => {
    const store = createLoadedStore();

    store.getState().updateCatalogNode('category', 'cat_digital', { name: 'Clothes' });

    expect(findEntry(store, 'categories', 'cat_digital').name).toBe('Digital');
    expect(store.getState().currentProject.categories.filter((entry) => entry.parentId === null && entry.name === 'Clothes')).toHaveLength(1);
  });

  it('prevents location siblings from being renamed to the same name', () => {
    const store = createLoadedStore();

    store.getState().updateCatalogNode('location', 'loc_shelf', { name: 'Box' });

    expect(findEntry(store, 'locations', 'loc_shelf').name).toBe('Shelf');
    expect(store.getState().currentProject.locations.filter((entry) => entry.parentId === 'loc_home' && entry.name === 'Box')).toHaveLength(1);
  });

  it('creates visible unique names when adding catalog roots and children', () => {
    const store = createLoadedStore({
      ...baseProject,
      categories: [
        { id: 'cat_existing', name: NEW_CATEGORY, level: 1, parentId: null },
        { id: 'cat_parent', name: 'Parent', level: 1, parentId: null },
        { id: 'cat_child', name: NEW_SUBCATEGORY, level: 2, parentId: 'cat_parent' }
      ],
      locations: [{ id: 'loc_existing', name: NEW_LOCATION, level: 1, parentId: null }]
    });

    store.getState().addCatalogRoot('category');
    const addedCategoryRoot = findEntry(store, 'categories', store.getState().selectedCatalogNodeIds.category);
    expect(addedCategoryRoot.name).toBe(`${NEW_CATEGORY} 2`);

    store.getState().selectCatalogNode('category', 'cat_parent');
    store.getState().addCatalogChild('category');
    const addedCategoryChild = findEntry(store, 'categories', store.getState().selectedCatalogNodeIds.category);
    expect(addedCategoryChild.name).toBe(`${NEW_SUBCATEGORY} 2`);
    expect(addedCategoryChild.parentId).toBe('cat_parent');

    store.getState().addCatalogRoot('location');
    const addedLocationRoot = findEntry(store, 'locations', store.getState().selectedCatalogNodeIds.location);
    expect(addedLocationRoot.name).toBe(`${NEW_LOCATION} 2`);
  });
});
