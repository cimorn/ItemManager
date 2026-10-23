import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebApp from '../../src/renderer/features/web/WebApp';
import { useProjectStore } from '../../src/renderer/store/project-store';

function backend({ hidePrivate = false } = {}){
 let project={revision:1,scope:'ordinary',meta:{},categories:[{id:'office',name:'办公',level:1,parentId:null},{id:'stationery',name:'文具',level:2,parentId:'office'},{id:'daily',name:'日常',level:1,parentId:null}],locations:[{id:'home',name:'家',level:1,parentId:null},{id:'cabinet',name:'柜子',level:2,parentId:'home'},{id:'box',name:'盒子',level:3,parentId:'cabinet'}],items:[{id:'item',name:'普通物品',categoryId:'stationery',locationId:'box',imagePath:'',tags:[]}]};
 let reject=false,hold=null;const writes=[];const response=(data,status=200)=>({ok:status<400,status,json:async()=>structuredClone(data)});
 const fetchImpl=vi.fn(async(url,init={})=>{
  if(url==='/api/session')return response({authenticated:true,csrfToken:'fixture-csrf'});
  if(url==='/api/project'&&init.method==='PUT'){
   writes.push(JSON.parse(init.body));if(hold)await hold;if(reject)return response({error:'网络保存失败，请重试',code:'UNAVAILABLE'},503);
   project={...JSON.parse(init.body),revision:project.revision+1};
   const visible = hidePrivate ? {...project, categories:project.categories.filter(node=>!node.isPrivate && node.name!=='Look'),locations:project.locations.filter(node=>!node.isPrivate)} : project;
   return response(visible);
  }
  if(url==='/api/project')return response(project);
  throw Error('Unexpected fixture request');
 });
 return {fetchImpl,writes,project:()=>structuredClone(project),reject:value=>reject=value,hold:value=>hold=value};
}
beforeEach(()=>{useProjectStore.getState().setProject(null);});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
async function open(b,mode='分类') {const rendered=render(<WebApp fetchImpl={b.fetchImpl}/>);await screen.findByRole('button',{name:'普通物品',exact:true});await userEvent.click(screen.getByRole('button',{name:mode,exact:true}));return rendered;}
const confirm=()=>screen.getByRole('button',{name:/^(确定|保存)$/});
async function create(user,action,name){await user.click(screen.getByRole('button',{name:action,exact:true}));await user.type(screen.getByLabelText('名称'),name);await user.click(confirm());}

describe('catalog confirmation persists to NAS',()=>{
 it('does not disclose privacy when a new Look category is hidden from the ordinary projection',async()=>{
  const b=backend({hidePrivate:true}),user=userEvent.setup();await open(b);
  await create(user,'新增顶级','Look');
  expect(await screen.findByText('分类已保存到 NAS')).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent('隐私');
  expect(screen.queryByRole('treeitem',{name:'Look'})).not.toBeInTheDocument();
  expect(b.project().categories.some(node=>node.name==='Look')).toBe(true);
 });
 it.each([['分类','categories'],['位置','locations']])('persists a new %s on confirmation and survives a fresh page read',async(mode,key)=>{
  const b=backend(),user=userEvent.setup(),view=await open(b,mode);await create(user,'新增顶级','新增测试');
  await waitFor(()=>expect(b.writes).toHaveLength(1));expect(b.project()[key].some(n=>n.name==='新增测试')).toBe(true);expect(useProjectStore.getState().dirty).toBe(false);
  view.unmount();await open(b,mode);expect(screen.getByRole('treeitem',{name:'新增测试'})).toBeInTheDocument();expect(b.project().items[0].name).toBe('普通物品');
 });
 it.each([['新增同级',null],['新增下级','office']])('persists %s with the current catalog selection',async(action,parentId)=>{
  const b=backend(),user=userEvent.setup();await open(b);await create(user,action,'新节点');await waitFor(()=>expect(b.writes).toHaveLength(1));
  expect(b.project().categories.find(n=>n.name==='新节点').parentId).toBe(parentId);
 });
 it('saves renaming and moving a child without requiring a separate project save',async()=>{
  const b=backend(),user=userEvent.setup();await open(b);await user.click(screen.getByRole('treeitem',{name:'办公'}));await user.click(screen.getByRole('treeitem',{name:'文具'}));
  await user.clear(screen.getByLabelText('名称'));await user.type(screen.getByLabelText('名称'),'新文具');await user.selectOptions(screen.getByLabelText('父级'),'daily');await user.click(confirm());
  await waitFor(()=>expect(b.writes).toHaveLength(1));expect(b.project().categories.find(n=>n.id==='stationery')).toMatchObject({name:'新文具',parentId:'daily'});expect(b.project().items[0].categoryId).toBe('stationery');
 });
 it('retains a rejected create draft and original project, then retries without duplicate nodes',async()=>{
  const b=backend(),user=userEvent.setup();b.reject(true);await open(b);const original=useProjectStore.getState().currentProject;
  await create(user,'新增顶级','重试分类');await screen.findByRole('alert');expect(screen.getByLabelText('名称')).toHaveValue('重试分类');expect(useProjectStore.getState().currentProject).toBe(original);expect(screen.queryByRole('treeitem',{name:'重试分类'})).not.toBeInTheDocument();
  b.reject(false);await user.click(confirm());await screen.findByRole('treeitem',{name:'重试分类'});expect(b.writes).toHaveLength(2);expect(b.project().categories.filter(n=>n.name==='重试分类')).toHaveLength(1);
 });
 it('does not clear a create form or submit twice while NAS persistence is pending',async()=>{
  const b=backend(),user=userEvent.setup();let release;const held=new Promise(resolve=>release=resolve);b.hold(held);await open(b);await create(user,'新增顶级','等待保存');
  await waitFor(()=>expect(b.writes).toHaveLength(1));expect(screen.getByLabelText('名称')).toHaveValue('等待保存');expect(screen.getByLabelText('名称')).toBeDisabled();expect(screen.getByRole('button',{name:'保存中…'})).toBeDisabled();
  await user.click(screen.getByRole('button',{name:'保存中…'}));expect(b.writes).toHaveLength(1);await act(async()=>release());await screen.findByRole('treeitem',{name:'等待保存'});expect(b.project().categories.filter(n=>n.name==='等待保存')).toHaveLength(1);
 });
});
