// @vitest-environment node
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
const require=createRequire(import.meta.url);
const {validateProject}=require('../../server/project-validation');
const {createInventoryService}=require('../../server/inventory-service');
const {createMemoryRepository}=require('../../server/repository');
const {createMemoryObjectStore}=require('../../server/oss-store');
function project(){return {meta:{},categories:[{id:'a',name:'A',level:1,parentId:null,sortOrder:1},{id:'b',name:'B',level:1,parentId:null,sortOrder:0},{id:'hidden',name:'Look',level:1,parentId:null,sortOrder:2}],locations:[{id:'room',name:'Room',level:1,parentId:null,sortOrder:0}],items:[{id:'visible',name:'Item',categoryId:'a',locationId:'room',tags:[],imagePath:''},{id:'private',name:'Private',categoryId:'hidden',tags:[],imagePath:''}]};}
describe('catalog order persistence',()=>{
 it('preserves order through validation',()=>{
   const p=project(); expect(validateProject(p).categories).toEqual(p.categories);
   expect(validateProject(p).locations[0].sortOrder).toBe(0);
 });
 it.each([-1,1.5,'2',null,1000001])('rejects invalid explicit order %s',sortOrder=>{
   const p=project(); p.categories[0].sortOrder=sortOrder;
   expect(()=>validateProject(p)).toThrow();
 });
 it('round trips through a new service instance and preserves hidden ordering during ordinary save',async()=>{
   const options={repository:createMemoryRepository(),objects:createMemoryObjectStore(),encryptionKey:randomBytes(32)};
   const service=createInventoryService(options);await service.importProject(project(),{includePrivate:true});
   const visible=await service.getProject();expect(visible.categories.map(n=>n.sortOrder)).toEqual([1,0]);
   visible.categories[0].sortOrder=0;visible.categories[1].sortOrder=1;await service.saveProject(visible);
   const reread=await createInventoryService(options).getProject({includePrivate:true});
   expect(reread.categories.find(n=>n.id==='hidden').sortOrder).toBe(2);
   expect(reread.categories.find(n=>n.id==='a').sortOrder).toBe(0);
   expect(reread.locations[0].sortOrder).toBe(0); expect(reread.items).toHaveLength(2);
 });
});
