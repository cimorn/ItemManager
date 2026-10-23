import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CatalogWorkspace from '../../src/renderer/features/catalog/CatalogWorkspace';
import { createProjectStore } from '../../src/renderer/store/project-store';
import ItemFilterChips from '../../src/renderer/features/items/ItemFilterChips';
import { buildFilterGroups } from '../../src/renderer/features/items/item-gallery-selectors';

const nodes=[{id:'a',name:'A',parentId:null,level:1},{id:'b',name:'B',parentId:null,level:1},{id:'aa',name:'AA',parentId:'a',level:2},{id:'ab',name:'AB',parentId:'a',level:2}];
function setup(mode='category',onRequireEdit=()=>true){
 const store=createProjectStore(),onSaveOrder=vi.fn();store.getState().setProject({meta:{},categories:nodes,locations:nodes,items:[]});
 function Harness(){const s=store();return <><CatalogWorkspace mode={mode} entries={s.currentProject[mode==='category'?'categories':'locations']} selectedId={s.selectedCatalogNodeIds[mode]} onSelect={s.selectCatalogNode} onReorder={s.reorderCatalogNode} onRequireEdit={onRequireEdit} onSaveOrder={onSaveOrder}/><ItemFilterChips groups={buildFilterGroups(s.currentProject.categories,s.currentProject.locations,s.itemFilters)} filters={s.itemFilters} onChange={s.setItemFilters}/></>;}
 render(<Harness/>);return {store,onSaveOrder,user:userEvent.setup()};
}
const treeOrder=()=>screen.getAllByRole('treeitem').map(el=>el.getAttribute('aria-label'));
describe('catalog sorting controls',()=>{
 it.each(['category','location'])('shows explicit %s sorting with same-level move controls and boundary states',async mode=>{
  const {user}=setup(mode);expect(screen.queryByRole('button',{name:'上移'})).not.toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:'排序',exact:true}));
  expect(screen.getByRole('button',{name:'上移'})).toBeDisabled();
  await user.click(screen.getByRole('button',{name:'下移'}));expect(treeOrder()).toEqual(['B','A']);
  expect(screen.getByRole('button',{name:'下移'})).toBeDisabled();
  await user.click(screen.getByRole('button',{name:'上移'}));expect(treeOrder()).toEqual(['A','B']);
 });
 it('supports sorting child nodes without moving them out of their parent',async()=>{
  const {user,store}=setup();await user.click(screen.getByRole('treeitem',{name:'A',exact:true}));
  await user.click(screen.getByRole('treeitem',{name:'AB',exact:true}));await user.click(screen.getByRole('button',{name:'排序',exact:true}));
  await user.click(screen.getByRole('button',{name:'上移'}));expect(treeOrder()).toEqual(['A','AB','AA','B']);
  expect(store.getState().currentProject.categories.find(n=>n.id==='ab').parentId).toBe('a');
 });
 it('saves through the existing project action and category select follows the manual order',async()=>{
  const {user,onSaveOrder}=setup();await user.click(screen.getByRole('button',{name:'排序',exact:true}));
  await user.click(screen.getByRole('button',{name:'下移'}));
  expect(within(screen.getByLabelText('一级分类筛选')).getAllByRole('option').map(el=>el.textContent)).toEqual(['分类','B','A']);
  await user.click(screen.getByRole('button',{name:'保存排序'}));expect(onSaveOrder).toHaveBeenCalledTimes(1);
 });
 it('allows keyboard arrows on a drag handle and hides handles outside sort mode',async()=>{
  const {user}=setup();await user.click(screen.getByRole('button',{name:'排序',exact:true}));
  const handle=screen.getByRole('button',{name:'拖动排序 A',exact:true});handle.focus();await user.keyboard('{ArrowDown}');
  expect(treeOrder()).toEqual(['B','A']);await user.click(screen.getByRole('button',{name:'收起排序',exact:true}));
  expect(screen.queryByRole('button',{name:'拖动排序 A',exact:true})).not.toBeInTheDocument();
 });
 it('respects edit protection and never changes a locked catalog',async()=>{
  const {user,store}=setup('category',()=>false);await user.click(screen.getByRole('button',{name:'排序',exact:true}));
  expect(screen.queryByRole('button',{name:'下移'})).not.toBeInTheDocument();expect(store.getState().dirty).toBe(false);
 });
});
