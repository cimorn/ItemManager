import { describe, expect, it } from 'vitest';
import { createProjectStore } from '../../src/renderer/store/project-store';
import { buildTree, getChildEntries, buildLeafEntries, getParentOptions } from '../../src/renderer/lib/project-data';

const nodes = [
  { id: 'a', name: 'A', parentId: null, level: 1 },
  { id: 'b', name: 'B', parentId: null, level: 1 },
  { id: 'c', name: 'C', parentId: null, level: 1 },
  { id: 'aa', name: 'AA', parentId: 'a', level: 2 },
  { id: 'ab', name: 'AB', parentId: 'a', level: 2 },
  { id: 'aaa', name: 'AAA', parentId: 'aa', level: 3 },
  { id: 'aab', name: 'AAB', parentId: 'aa', level: 3 }
];
function loaded() {
  const store = createProjectStore();
  store.getState().setProject({ meta: {}, categories: nodes.filter(n => n.level < 3), locations: nodes,
    items: [{ id: 'item', name: '物品', categoryId: 'aa', locationId: 'aaa', imagePath: 'img-existing' }] });
  return store;
}
const ids = entries => entries.map(e => e.id);

describe('saved sibling catalog order', () => {
  it('keeps legacy alphabetical order until manually reordered', () => {
    expect(ids(getChildEntries([nodes[2], nodes[0], nodes[1]]))).toEqual(['a', 'b', 'c']);
  });
  it.each(['category', 'location'])('moves a %s root with descendants and references intact, then survives reload', mode => {
    const store = loaded(), key = mode === 'category' ? 'categories' : 'locations';
    const before = structuredClone(store.getState().currentProject);
    store.getState().selectCatalogNode(mode, 'a');
    store.getState().reorderCatalogNode(mode, 'c', 'a', 'before');
    const after = store.getState().currentProject;
    expect(ids(buildTree(after[key]))).toEqual(['c', 'a', 'b']);
    expect(after.items).toEqual(before.items);
    expect(after[key].filter(n => n.parentId)).toEqual(before[key].filter(n => n.parentId));
    expect(store.getState().selectedCatalogNodeIds[mode]).toBe('a');
    expect(store.getState().dirty).toBe(true);
    store.getState().setProject(JSON.parse(JSON.stringify(after)));
    expect(ids(getChildEntries(store.getState().currentProject[key]))).toEqual(['c', 'a', 'b']);
  });
  it('supports before/after ordering at the second and third levels', () => {
    const store = loaded();
    store.getState().reorderCatalogNode('category', 'aa', 'ab', 'after');
    expect(ids(getChildEntries(store.getState().currentProject.categories, 'a'))).toEqual(['ab', 'aa']);
    store.getState().reorderCatalogNode('location', 'aab', 'aaa', 'before');
    expect(ids(getChildEntries(store.getState().currentProject.locations, 'aa'))).toEqual(['aab', 'aaa']);
    expect(ids(buildLeafEntries(store.getState().currentProject.locations))).toEqual(['aab', 'aaa', 'ab', 'b', 'c']);
  });
  it('rejects cross-parent, self, missing, invalid mode/position and unchanged moves without marking dirty', () => {
    const store = loaded(), before = store.getState().currentProject;
    for (const args of [['category','aa','b','before'],['category','a','a','after'],['category','missing','a','before'],['oops','b','a','before'],['category','b','a','invalid'],['category','a','b','before']]) {
      store.getState().reorderCatalogNode(...args);
      expect(store.getState().currentProject).toBe(before);
      expect(store.getState().dirty).toBe(false);
    }
  });
  it('appends new and reparented siblings after the manual order and keeps rename in place', () => {
    const store = loaded();
    store.getState().reorderCatalogNode('category','b','a','before');
    store.getState().addCatalogRoot('category','0 New');
    expect(getChildEntries(store.getState().currentProject.categories).map(n => n.name)).toEqual(['B','A','C','0 New']);
    store.getState().updateCatalogNode('category','b',{name:'Z'});
    expect(ids(getChildEntries(store.getState().currentProject.categories)).slice(0,3)).toEqual(['b','a','c']);
    store.getState().reorderCatalogNode('location','aab','aaa','before');
    store.getState().updateCatalogNode('location','aab',{parentId:'ab'});
    store.getState().updateCatalogNode('location','aaa',{parentId:'ab'});
    expect(ids(getChildEntries(store.getState().currentProject.locations,'ab'))).toEqual(['aab','aaa']);
  });
  it('does not reorder a locked desktop project', () => {
    const store = loaded(); store.setState({currentProject:{...store.getState().currentProject,privacy:{locked:true}}});
    const before=store.getState().currentProject; store.getState().reorderCatalogNode('category','b','a','before');
    expect(store.getState().currentProject).toBe(before); expect(store.getState().dirty).toBe(false);
  });
  it('uses the manual order in parent selectors as well as tree and item selectors', () => {
    const store = loaded();store.getState().reorderCatalogNode('category','b','a','before');
    const entries=store.getState().currentProject.categories;
    expect(getParentOptions(entries,'category',entries.find(n=>n.id==='aa')).map(n=>n.id)).toEqual(['b','a','c']);
  });
});
