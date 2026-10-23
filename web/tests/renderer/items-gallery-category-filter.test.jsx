import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import AppShell from '../../src/renderer/features/layout/AppShell';
import { createProjectStore } from '../../src/renderer/store/project-store';
import { applyItemGalleryFilters } from '../../src/renderer/features/items/item-gallery-selectors';

const project={meta:{},categories:[
 {id:'clothes',name:'服装',level:1,parentId:null,sortOrder:1},{id:'digital',name:'数码',level:1,parentId:null,sortOrder:0},{id:'shoes',name:'鞋子',level:2,parentId:'clothes'},
 {id:'device',name:'设备',level:2,parentId:'digital',sortOrder:1},{id:'storage',name:'存储',level:2,parentId:'digital',sortOrder:0},{id:'empty',name:'空分类',level:1,parentId:null,sortOrder:2}],
 locations:[{id:'room',name:'房间',level:1,parentId:null},{id:'desk',name:'桌下',level:2,parentId:'room'},{id:'box',name:'盒子',level:3,parentId:'desk'},{id:'daily',name:'日常',level:1,parentId:null}],
 items:[{id:'a',name:'NAS',categoryId:'device',locationId:'box',tags:['T-001']},{id:'b',name:'键盘',categoryId:'device',locationId:'daily',tags:[]},{id:'c',name:'硬盘',categoryId:'storage',locationId:'desk',tags:[]},{id:'d',name:'鞋',categoryId:'shoes',locationId:'daily',tags:[]},{id:'e',name:'主分类物品',categoryId:'digital',locationId:'room',tags:[]}]};
function setup(initial={}){
 const store=createProjectStore();store.getState().setProject(project);
 const {subCategoryId,...parents}=initial;store.getState().setItemFilters(parents);
 if(subCategoryId)store.getState().setItemFilters({subCategoryId});
 function Harness(){const s=store(),p=s.currentProject;return <AppShell project={p} selectedSection="items" selectedCatalogMode="category" selectedItemId={null} visibleItems={applyItemGalleryFilters(p.items,p.categories,p.locations,s.itemFilters,s.search)} filters={s.itemFilters} search={s.search} onFilterChange={s.setItemFilters} onSearch={s.setSearch}/>;}
 const rendered=render(<Harness/>);return {store,user:userEvent.setup(),...rendered};
}
describe('combined category/location hierarchy filters',()=>{
 it('places both category selects and all three location selects in the same panel without a category sidebar',()=>{
  const {container}=setup();const panel=screen.getByRole('group',{name:'分类和位置筛选'});
  expect(within(panel).getAllByRole('combobox')).toHaveLength(5);expect(screen.queryByRole('navigation',{name:'分类导航'})).not.toBeInTheDocument();expect(container.querySelector('.app-sidebar')).toBeNull();
  expect(screen.getByLabelText('二级分类筛选')).toBeDisabled();expect(screen.getByLabelText('二级位置筛选')).toBeDisabled();expect(screen.getByLabelText('三级位置筛选')).toBeDisabled();
  expect(screen.queryByRole('button',{name:'数码',exact:true})).not.toBeInTheDocument();
 });
 it('filters a main category including direct items, then a child category, and intersects location',async()=>{
  const {user,store}=setup();await user.selectOptions(screen.getByLabelText('一级分类筛选'),'digital');
  expect(screen.queryByRole('button',{name:'鞋',exact:true})).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'主分类物品',exact:true})).toBeInTheDocument();
  expect(screen.getByLabelText('二级分类筛选')).toBeEnabled();await user.selectOptions(screen.getByLabelText('二级分类筛选'),'device');
  expect(screen.getByRole('button',{name:'NAS',exact:true})).toBeInTheDocument();expect(screen.getByRole('button',{name:'键盘',exact:true})).toBeInTheDocument();expect(screen.queryByRole('button',{name:'硬盘',exact:true})).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('一级位置筛选'),'room');await user.selectOptions(screen.getByLabelText('二级位置筛选'),'desk');await user.selectOptions(screen.getByLabelText('三级位置筛选'),'box');
  expect(screen.getByRole('button',{name:'NAS',exact:true})).toBeInTheDocument();expect(screen.queryByRole('button',{name:'键盘',exact:true})).not.toBeInTheDocument();expect(store.getState().dirty).toBe(false);
 });
 it('clears a child on parent change while preserving location, tag and search',async()=>{
  const {user,store}=setup({mainCategoryId:'digital',subCategoryId:'device',locationId:'box',tag:'T-001'});await user.type(screen.getByRole('textbox',{name:'搜索物品'}),'NAS');
  await user.selectOptions(screen.getByLabelText('一级分类筛选'),'clothes');expect(store.getState().itemFilters).toMatchObject({mainCategoryId:'clothes',subCategoryId:'',locationId:'box',tag:'T-001'});expect(store.getState().search).toBe('NAS');
  expect(within(screen.getByLabelText('二级分类筛选')).queryByRole('option',{name:'设备'})).not.toBeInTheDocument();expect(within(screen.getByLabelText('二级分类筛选')).getByRole('option',{name:'鞋子'})).toBeInTheDocument();
 });
 it('All at child level keeps the parent, and All at parent level clears both levels',async()=>{
  const {user,store}=setup({mainCategoryId:'digital',subCategoryId:'device',locationId:'desk'});
  await user.selectOptions(screen.getByLabelText('二级分类筛选'),'__all__');expect(store.getState().itemFilters).toMatchObject({mainCategoryId:'digital',subCategoryId:'',locationId:'desk'});expect(screen.getByRole('button',{name:'硬盘',exact:true})).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('一级分类筛选'),'');expect(store.getState().itemFilters).toMatchObject({mainCategoryId:'',subCategoryId:'',locationId:'desk'});expect(screen.getByLabelText('二级分类筛选')).toBeDisabled();
 });
 it('uses saved sibling ordering in both category levels and disables an empty child level',async()=>{
  const {user}=setup();expect(within(screen.getByLabelText('一级分类筛选')).getAllByRole('option').map(el=>el.textContent)).toEqual(['分类','数码','服装','空分类']);
  await user.selectOptions(screen.getByLabelText('一级分类筛选'),'digital');expect(within(screen.getByLabelText('二级分类筛选')).getAllByRole('option').map(el=>el.textContent)).toEqual(['二级分类','全部','存储','设备']);
  await user.selectOptions(screen.getByLabelText('一级分类筛选'),'empty');expect(screen.getByLabelText('二级分类筛选')).toBeDisabled();
 });
});
