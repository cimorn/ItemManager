'use strict';
const {StorageError}=require('./errors');
const ITEM_FIELDS=['barcode','code','name','brand','quantity','specification','notes'];
const META_FIELDS=['name','createdAt','updatedAt','appVersion'];
const ID=/^[A-Za-z0-9_-]{1,128}$/;
function invalid(){throw new StorageError('INVALID_PROJECT');}
function text(value,max=512){if(value==null)return '';if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))invalid();return value.trim();}
function id(value,nullable=false){if(nullable&&(value==null||value===''))return null;if(typeof value!=='string'||!ID.test(value)||['__proto__','constructor','prototype'].includes(value))invalid();return value;}
function optionalBoolean(value,field){if(!Object.hasOwn(value,field))return {};if(typeof value[field]!=='boolean')invalid();return {[field]:value[field]};}
function getItemLocationIds(item){
  if(!Object.hasOwn(item,'locationIds'))return item.locationId?[item.locationId]:[];
  if(!Array.isArray(item.locationIds)||item.locationIds.length>32)invalid();
  return [...new Set(item.locationIds.map(value=>id(value)))];
}
function lineage(entries,nodeId){const byId=entries instanceof Map?entries:new Map(entries.map(x=>[x.id,x]));const result=[];let node=byId.get(nodeId);let count=0;while(node){if(++count>16)invalid();result.unshift(node);node=byId.get(node.parentId);}return result;}
function lineageReader(entries){const byId=new Map(entries.map(x=>[x.id,x]));const cache=new Map();return nodeId=>{if(!cache.has(nodeId))cache.set(nodeId,lineage(byId,nodeId));return cache.get(nodeId);};}
function validateCatalog(input,maxDepth,maxCount){
  if(!Array.isArray(input)||input.length>maxCount)invalid();
  const seen=new Set();const result=input.map(entry=>{
    if(!entry||typeof entry!=='object')invalid();const entryId=id(entry.id);if(seen.has(entryId))invalid();seen.add(entryId);
    const name=text(entry.name,160);if(!name||/[\\/?#%]/.test(name)||name==='.'||name==='..')invalid();
    const node={id:entryId,name,parentId:id(entry.parentId,true),level:Number(entry.level)||1,...optionalBoolean(entry,'isPrivate')};
    if(Object.hasOwn(entry,'sortOrder')){if(!Number.isInteger(entry.sortOrder)||entry.sortOrder<0||entry.sortOrder>1000000)invalid();node.sortOrder=entry.sortOrder;}
    for(const field of ['createdAt','updatedAt']) if(entry[field]!=null)node[field]=text(entry[field],64);
    return node;
  });
  const byId=new Map(result.map(x=>[x.id,x]));
  for(const node of result){
    const trail=new Set([node.id]);let parent=byId.get(node.parentId);let depth=1;
    if(node.parentId&&!parent)invalid();
    while(parent){if(trail.has(parent.id)||++depth>maxDepth)invalid();trail.add(parent.id);parent=byId.get(parent.parentId);}
    node.level=depth;
  }
  return result;
}
function validateProject(input,{allowImagePaths=false}={}){
  if(!input||typeof input!=='object'||Array.isArray(input))invalid();
  let encoded;try{encoded=JSON.stringify(input);}catch{invalid();}
  if(Buffer.byteLength(encoded)>3*1024*1024)throw new StorageError('TOO_LARGE');
  const categories=validateCatalog(input.categories||[],2,2000);const locations=validateCatalog(input.locations||[],3,3000);
  const categoryLineage=lineageReader(categories);const locationLineage=lineageReader(locations);
  if(!Array.isArray(input.items)||input.items.length>10000)invalid();
  const categoryIds=new Set(categories.map(x=>x.id));const locationIds=new Set(locations.map(x=>x.id));const seen=new Set([...categoryIds,...locationIds]);
  if(seen.size!==categories.length+locations.length)invalid();
  const items=input.items.map(value=>{
    if(!value||typeof value!=='object')invalid();const itemId=id(value.id);if(seen.has(itemId))invalid();seen.add(itemId);
    const assignedLocations=getItemLocationIds(value);
    const item={id:itemId,categoryId:id(value.categoryId,true),locationId:Object.hasOwn(value,'locationIds')?(assignedLocations[0]||null):id(value.locationId,true),...optionalBoolean(value,'isPackaged')};
    if(Object.hasOwn(value,'locationIds'))item.locationIds=assignedLocations;
    if(item.categoryId&&!categoryIds.has(item.categoryId)||assignedLocations.some(locationId=>!locationIds.has(locationId)))invalid();
    for(const field of ITEM_FIELDS){
      const clean=text(value[field],field==='notes'?16000:512);
      item[field]=(field==='notes'||field==='specification')?clean.split(/[\s·]+/u).filter(Boolean).join(' '):clean;
    }
    for(const field of ['createdAt','updatedAt'])if(value[field]!=null)item[field]=text(value[field],64);
    if(value.isPrivate!=null&&typeof value.isPrivate!=='boolean')invalid();item.isPrivate=value.isPrivate===true;
    if(!Array.isArray(value.tags||[])||(value.tags||[]).length>100)invalid();item.tags=[...new Set((value.tags||[]).map(x=>text(x,128)).filter(Boolean))];
    item.imagePath=text(value.imagePath,allowImagePaths?2048:128);
    if(item.imagePath&&!allowImagePaths&&!/^img_[a-f0-9-]{36}$/.test(item.imagePath))throw new StorageError('INVALID_IMAGE');
    item.categoryPath=categoryLineage(item.categoryId).map(x=>x.name).join(' / ');
    item.locationPath=locationLineage(item.locationId).map(x=>x.name).join(' / ');
    if(Object.hasOwn(value,'locationIds'))item.locationPaths=assignedLocations.map(locationId=>locationLineage(locationId).map(x=>x.name).join(' / '));
    return item;
  });
  const meta={};for(const field of META_FIELDS)if(input.meta?.[field]!=null)meta[field]=text(input.meta[field],512);
  meta.tagPrefixes={};
  if(input.meta?.tagPrefixes!=null){
    if(typeof input.meta.tagPrefixes!=='object'||Array.isArray(input.meta.tagPrefixes)||Object.keys(input.meta.tagPrefixes).length>2000)invalid();
    for(const [key,value] of Object.entries(input.meta.tagPrefixes))if(categoryIds.has(key))meta.tagPrefixes[key]=text(value,16);
  }
  return {meta,categories,locations,items};
}
function normalizeTag(value){const normalized=String(value).trim().replace(/[＿_—–\s]+/g,'-').toUpperCase();const code=normalized.match(/^([A-Z]{1,6})-?(\d{1,3})$/);return code?`${code[1]}-${code[2].padStart(3,'0')}`:normalized;}
function privacyRules(rules={}){return {categoryNames:new Set((rules.categoryNames||rules.privateCategoryNames||['Look']).map(x=>String(x).trim().toLowerCase())),tags:new Set((rules.tags||rules.privateTags||[]).map(normalizeTag))};}
function createPrivacyClassifier(project,rules={}){
  const normalized=privacyRules(rules);
  const categoryLineage=lineageReader(project.categories);const locationLineage=lineageReader(project.locations);
  return item=>item.isPrivate===true||categoryLineage(item.categoryId).some(x=>x.isPrivate===true||normalized.categoryNames.has(x.name.toLowerCase()))||getItemLocationIds(item).some(locationId=>locationLineage(locationId).some(x=>x.isPrivate===true))||(item.tags||[]).some(x=>normalized.tags.has(normalizeTag(x)));
}
function isPrivateItem(item,project,rules={}){return createPrivacyClassifier(project,rules)(item);}
function visibleCatalog(entries,items,field,rules,category){
  const keep=new Set();const stats=new Map(entries.map(x=>[x.id,{ordinary:0,private:0}]));const normalized=privacyRules(rules);
  const readLineage=lineageReader(entries);
  const references=item=>field==='locationId'?getItemLocationIds(item):[item[field]];
  for(const item of items)for(const nodeId of references(item))for(const node of readLineage(nodeId))stats.get(node.id)[item.isPrivate?'private':'ordinary']++;
  for(const node of entries){
    const ancestors=readLineage(node.id);
    const hidden=ancestors.some(ancestor=>{
      const counts=stats.get(ancestor.id);
      return ancestor.isPrivate===true||(category&&normalized.categoryNames.has(ancestor.name.toLowerCase()))||(counts.private>0&&counts.ordinary===0);
    });
    if(!hidden)for(const parent of ancestors)keep.add(parent.id);
  }
  for(const item of items.filter(x=>!x.isPrivate))for(const nodeId of references(item))for(const node of readLineage(nodeId))keep.add(node.id);
  return entries.filter(x=>keep.has(x.id));
}
function projectPublicProjection(project,{includePrivate=false,rules={}}={}){
  const classify=createPrivacyClassifier(project,rules);const items=project.items.map(item=>({...item,isPrivate:classify(item)}));
  if(includePrivate)return {...project,items,paths:{projectDir:'nas'},scope:'all'};
  const categories=visibleCatalog(project.categories,items,'categoryId',rules,true);const locations=visibleCatalog(project.locations,items,'locationId',rules,false);
  const allowed=new Set(categories.map(x=>x.id));
  return {...project,meta:{...project.meta,tagPrefixes:Object.fromEntries(Object.entries(project.meta.tagPrefixes||{}).filter(([id])=>allowed.has(id)))},categories,locations,items:items.filter(x=>!x.isPrivate),paths:{projectDir:'nas'},scope:'ordinary'};
}
module.exports={validateProject,projectPublicProjection,isPrivateItem,lineage,getItemLocationIds,createPrivacyClassifier};
