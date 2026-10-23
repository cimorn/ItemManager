'use strict';
const {applyItemTimestamps}=require('./item-timestamps');
const {randomUUID,createHash}=require('node:crypto');
const {StorageError,safeError}=require('./errors');
const {normalizeKey,encryptBytes,decryptBytes}=require('./crypto');
const {validateProject,projectPublicProjection,isPrivateItem,lineage,getItemLocationIds,createPrivacyClassifier}=require('./project-validation');
const {createBoundedExecutor,createEncryptedImageCache}=require('./encrypted-image-cache');
const {createCardImageExecutor}=require('./card-image-executor');
const CARD_VERSION='card-v1-384-q65';
const MAX_IMAGE=20*1024*1024;
const STAGED_MAX_AGE=24*60*60*1000;
const STATE_AAD='nas-storage:inventory:v1';
const clone=value=>JSON.parse(JSON.stringify(value));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function sniffImage(bytes,mime){
  if(!Buffer.isBuffer(bytes)&&!(bytes instanceof Uint8Array))throw new StorageError('INVALID_IMAGE');
  const buffer=Buffer.from(bytes);if(buffer.length>MAX_IMAGE)throw new StorageError('TOO_LARGE');
  let detected='';
  if(buffer.length>=24&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&buffer.subarray(12,16).toString()==='IHDR')detected='image/png';
  else if(buffer.length>=4&&buffer[0]===255&&buffer[1]===216&&buffer[2]===255&&buffer[buffer.length-2]===255&&buffer[buffer.length-1]===217)detected='image/jpeg';
  else if(buffer.length>=13&&/^GIF8[79]a$/.test(buffer.subarray(0,6).toString()))detected='image/gif';
  else if(buffer.length>=16&&buffer.subarray(0,4).toString()==='RIFF'&&buffer.subarray(8,12).toString()==='WEBP')detected='image/webp';
  else if(buffer.length>=54&&buffer.subarray(0,2).toString()==='BM'){
    const declared=buffer.readUInt32LE(2),offset=buffer.readUInt32LE(10),dibSize=buffer.readUInt32LE(14);
    const width=buffer.readInt32LE(18),height=buffer.readInt32LE(22),planes=buffer.readUInt16LE(26),bits=buffer.readUInt16LE(28);
    if(declared===buffer.length&&dibSize>=40&&offset>=14+dibSize&&offset<buffer.length&&width>0&&height!==0&&planes===1&&[1,4,8,16,24,32].includes(bits))detected='image/bmp';
  }
  if(!detected||(mime&&mime!==detected&&!(mime==='image/jpg'&&detected==='image/jpeg')))throw new StorageError('INVALID_IMAGE');
  return {bytes:buffer,mime:detected};
}
function blankState(){return {version:1,projectRevision:0,project:{meta:{name:'物品管理',tagPrefixes:{}},categories:[],locations:[],items:[]},images:{},pending:null};}
// Inspect raw field presence before validation. An older open tab has never
// learned these fields and must not erase metadata created by newer clients.
function preserveOptionalMetadata(current,incoming){
  const previousItems=new Map(current.items.map(item=>[item.id,item]));
  const items=Array.isArray(incoming.items)?incoming.items.map(item=>{
    const previous=previousItems.get(item?.id);if(!previous)return item;
    const next={...item};
    if(!Object.hasOwn(item,'isPackaged')&&Object.hasOwn(previous,'isPackaged'))next.isPackaged=previous.isPackaged;
    if(!Object.hasOwn(item,'locationIds')&&Object.hasOwn(previous,'locationIds')){
      next.locationIds=(item.locationId||null)===(previous.locationId||null)?previous.locationIds:(item.locationId?[item.locationId]:[]);
    }
    return next;
  }):incoming.items;
  const result={...incoming,items};
  for(const key of ['categories','locations']){
    const previous=new Map(current[key].map(node=>[node.id,node]));
    if(Array.isArray(incoming[key]))result[key]=incoming[key].map(node=>{
      const old=previous.get(node?.id);
      return old&&Object.hasOwn(old,'isPrivate')&&!Object.hasOwn(node,'isPrivate')?{...node,isPrivate:old.isPrivate}:node;
    });
  }
  return result;
}
function mergeOrdinary(current,incoming,rules){
  const visible=projectPublicProjection(current,{rules});
  const visibleIds=new Set(visible.items.map(x=>x.id));const hidden=current.items.filter(x=>!visibleIds.has(x.id));const hiddenIds=new Set(hidden.map(x=>x.id));
  if(!Array.isArray(incoming.items)||incoming.items.some(x=>hiddenIds.has(x?.id)))throw new StorageError('FORBIDDEN');
  const allowedPrefixes=new Set([...(visible.categories||[]),...(incoming.categories||[])].map(x=>x.id));
  if(Object.keys(incoming.meta?.tagPrefixes||{}).some(id=>!allowedPrefixes.has(id)))throw new StorageError('FORBIDDEN');
  const visibleCategoryIds=new Set(visible.categories.map(x=>x.id));
  const retainedPrefixes=Object.hasOwn(incoming.meta||{},'tagPrefixes')?Object.fromEntries(Object.entries(current.meta.tagPrefixes||{}).filter(([id])=>!visibleCategoryIds.has(id))):current.meta.tagPrefixes;
  const merged={...incoming,items:[...incoming.items,...hidden],meta:{...current.meta,...incoming.meta,tagPrefixes:{...retainedPrefixes,...incoming.meta?.tagPrefixes}}};
  for(const [key,reference] of [['categories','categoryId'],['locations','locationId']]){
    const incomingNodes=incoming[key]||[];if(!Array.isArray(incomingNodes))throw new StorageError('INVALID_PROJECT');
    const visibleNodes=new Set(visible[key].map(x=>x.id));const byId=new Map(current[key].map(x=>[x.id,x]));
    const hiddenNodes=current[key].filter(x=>!visibleNodes.has(x.id));const hiddenNodeIds=new Set(hiddenNodes.map(x=>x.id));
    if(incomingNodes.some(x=>hiddenNodeIds.has(x?.id)))throw new StorageError('FORBIDDEN');
    const references=item=>reference==='locationId'?getItemLocationIds(item):[item?.[reference]];
    for(const item of incoming.items)if(references(item).some(id=>hiddenNodeIds.has(id)))throw new StorageError('FORBIDDEN');
    const result=new Map(incomingNodes.map(x=>[x.id,x]));for(const node of hiddenNodes)result.set(node.id,node);
    // A partial catalog cannot strand retained rows. Restore their missing ancestors.
    const addAncestors=id=>{let count=0;while(id&&!result.has(id)){const node=byId.get(id);if(!node||++count>16)break;result.set(id,node);id=node.parentId;}};
    for(const item of merged.items)for(const id of references(item))addAncestors(id);
    for(const node of [...result.values()])addAncestors(node.parentId);
    merged[key]=[...result.values()];
  }
  return merged;
}
function createInventoryService({repository,objects,encryptionKey,rules={},imageCacheOptions={},imageReadOptions={},cardImageOptions={}}){
  const key=normalizeKey(encryptionKey);
  if(!repository?.read||!repository?.compareAndSwap||!objects?.put||!objects?.get||!objects?.copy||!objects?.delete||!objects?.head)throw new StorageError('INVALID_CONFIG');
  let serial=Promise.resolve();
  const imageCache=createEncryptedImageCache(imageCacheOptions);
  const cardCache=createEncryptedImageCache({maxBytes:16*1024*1024,maxEntries:128,ttlMs:5*60*1000,...cardImageOptions.cache});
  const cardExecutor=createCardImageExecutor(cardImageOptions);
  const transformCard=cardImageOptions.transform||((input)=>cardExecutor.transform(input));
  const readBounded=createBoundedExecutor({concurrency:8,maxQueued:32,...imageReadOptions});
  function run(task){const next=serial.then(task).catch(error=>{throw safeError(error);});serial=next.catch(()=>{});return next;}
  async function readState(){
    const record=await repository.read();
    if(!record)return {revision:0,state:blankState()};
    const state=JSON.parse(decryptBytes(record.envelope,key,STATE_AAD).toString('utf8'));
    if(state.version!==1||!state.project||!state.images)throw new StorageError();
    return {revision:record.revision,state};
  }
  async function writeState(snapshot,state){
    const revision=snapshot.revision+1;const payload=Buffer.from(JSON.stringify(state),'utf8');
    // MongoDB's document limit is 16 MiB; leave room for base64 and BSON fields.
    if(payload.length>11*1024*1024)throw new StorageError('TOO_LARGE');
    if(!await repository.compareAndSwap(snapshot.revision,{revision,envelope:encryptBytes(payload,key,STATE_AAD)}))throw new StorageError('CONFLICT');
    return {revision,state};
  }
  function projection(state,includePrivate=false){
    const project={...projectPublicProjection(state.project,{includePrivate,rules}),revision:state.projectRevision};
    if(state.pending?.phase==='cleanup')project.storageWarning={code:'CLEANUP_PENDING',message:'图片清理尚未完成，将自动重试'};
    return project;
  }
  function decodePhoto(record,bytes){
    const decoded=decryptBytes(JSON.parse(bytes.toString('utf8')),key,`nas-storage:image:${record.id}:v1`);
    if(digest(decoded)!==record.digest)throw new StorageError();
    return decoded;
  }
  function authorizeImage(state,imageId,includePrivate){
    const item=state.project.items.find(x=>x.imagePath===imageId);
    const record=state.images[imageId];
    if(!item||!record||!record.ready||record.ownerId!==item.id||(!includePrivate&&isPrivateItem(item,state.project,rules)))throw new StorageError('NOT_FOUND');
    return record;
  }
  async function verifyPhoto(record,target){
    const head=await objects.head(target);if(head.size!==record.encryptedSize)throw new StorageError();
    decodePhoto(record,await objects.get(target));
  }
  async function resume(){
    let snapshot=await readState();let state=snapshot.state;
    // Register cleanup before deleting expired unbound uploads. Fresh upload
    // intents may belong to another active process and must be left intact.
    const expired=Object.values(state.images).filter(x=>!x.ownerId&&Number.isFinite(x.createdAt)&&Date.now()-x.createdAt>=STAGED_MAX_AGE);
    if(expired.length&&!state.pending){
      state=clone(state);for(const image of expired)delete state.images[image.id];
      state.pending={id:randomUUID(),phase:'cleanup',keys:expired.map(x=>x.key)};snapshot=await writeState(snapshot,state);
    }
    if(!state.pending)return snapshot;
    const operation=state.pending;
    if(operation.phase==='copy'){
      for(const copy of operation.copies){
        await objects.copy(copy.source,copy.target);
        await verifyPhoto(operation.targetImages[copy.imageId],copy.target);
      }
      const next=clone(state);next.project=operation.targetProject;next.images=operation.targetImages;next.projectRevision=operation.targetRevision;
      next.pending={id:operation.id,phase:'cleanup',keys:operation.cleanup};
      snapshot=await writeState(snapshot,next);state=next;
    }
    if(state.pending?.phase==='cleanup'){
      const active=new Set(Object.values(state.images).map(x=>x.key));
      for(const objectKey of state.pending.keys){
        if(active.has(objectKey))throw new StorageError();
        try{await objects.delete(objectKey);}catch{return snapshot;}
      }
      const next=clone(state);next.pending=null;snapshot=await writeState(snapshot,next);
    }
    return snapshot;
  }
  function destination(project,item,imageId,operationId){
    // Every operation receives a fresh generation. A delayed cleanup from an
    // older process can therefore never delete an object a later save reuses.
    const names=lineage(project.categories,item.categoryId).map(x=>x.name);
    return ['Storage',...(names.length?names:['_uncategorized']),item.id,`${imageId}-${operationId}.enc`].join('/');
  }
  async function commitProject(snapshot,project){
    const state=snapshot.state;const targetImages=clone(state.images);const used=new Set();const copies=[];const cleanup=state.pending?.phase==='cleanup'?[...state.pending.keys]:[];const operationId=randomUUID();
    for(const item of project.items){
      if(!item.imagePath)continue;
      const image=targetImages[item.imagePath];
      if(!image||!image.ready||(image.ownerId&&image.ownerId!==item.id)||used.has(image.id))throw new StorageError('INVALID_IMAGE');
      used.add(image.id);
      const oldItem=state.project.items.find(x=>x.id===item.id);
      const oldCategory=oldItem?lineage(state.project.categories,oldItem.categoryId).map(x=>x.name).join('/') : null;
      const newCategory=lineage(project.categories,item.categoryId).map(x=>x.name).join('/');
      if(!image.ownerId||oldCategory!==newCategory){
        const nextKey=destination(project,item,image.id,operationId);
        copies.push({imageId:image.id,source:image.key,target:nextKey});cleanup.push(image.key);image.key=nextKey;
      }
      image.ownerId=item.id;
    }
    for(const image of Object.values(targetImages))if(image.ownerId&&!used.has(image.id)){cleanup.push(image.key);delete targetImages[image.id];}
    const next=clone(state);
    if(!copies.length&&!cleanup.length){next.project=project;next.projectRevision++;return writeState(snapshot,next);}
    next.pending={id:operationId,phase:'copy',targetProject:project,targetImages,targetRevision:state.projectRevision+1,copies,cleanup:[...new Set(cleanup)]};
    await writeState(snapshot,next);return resume();
  }
  async function stageImage(input,{requiresPrivateAccess=false}={}){
    const validated=sniffImage(input.bytes,input.mime);const id=`img_${randomUUID()}`;
    const encrypted=Buffer.from(JSON.stringify(encryptBytes(validated.bytes,key,`nas-storage:image:${id}:v1`)),'utf8');
    let snapshot=await resume();const state=clone(snapshot.state);
    if(Object.keys(state.images).length>=15000)throw new StorageError('TOO_LARGE');
    const record={id,key:`Storage/.staging/${id}.enc`,mime:validated.mime,digest:digest(validated.bytes),encryptedSize:encrypted.length,ownerId:null,ready:false,createdAt:Date.now(),...(requiresPrivateAccess?{requiresPrivateAccess:true}:{})};
    state.images[id]=record;snapshot=await writeState(snapshot,state);
    await objects.put(record.key,encrypted,'application/octet-stream');await verifyPhoto(record,record.key);
    const next=clone(snapshot.state);next.images[id].ready=true;await writeState(snapshot,next);
    return {imageId:id};
  }
  return {
    getProject(options={}){return run(async()=>projection((await resume()).state,options.includePrivate===true));},
    saveProject(project,options={}){return run(async()=>{
      const snapshot=await resume();const {state}=snapshot;const all=options.includePrivate===true;
      if(project?.scope==='all'&&!all)throw new StorageError('FORBIDDEN');
      if(!Number.isSafeInteger(project?.revision)||project.revision!==state.projectRevision)throw new StorageError('CONFLICT');
      const compatible=preserveOptionalMetadata(state.project,project);
      const combined=all?compatible:mergeOrdinary(state.project,compatible,rules);const validated=validateProject(combined);
      // Persist privacy classification so moving a row out of Look does not
      // unexpectedly publish it; a privacy-capable edit can clear the flag.
      const classify=createPrivacyClassifier(validated,rules);for(const item of validated.items)item.isPrivate=classify(item);
      for(const item of validated.items){
        const image=state.images[item.imagePath];
        if(image?.requiresPrivateAccess&&!image.ownerId&&!all)throw new StorageError('FORBIDDEN');
      }
      return projection((await commitProject(snapshot,applyItemTimestamps(state.project,validated))).state,all);
    });},
    uploadImage(input){return run(()=>stageImage(input));},
    copyImage(imageId,options={}){return run(async()=>{
      const {state}=await resume();
      const image=authorizeImage(state,imageId,options.includePrivate===true);
      const source=state.project.items.find(item=>item.id===image.ownerId);
      const bytes=decodePhoto(image,await objects.get(image.key));
      // New image ID and encryption AAD keep deletion/moves independent of the source.
      return stageImage({bytes,mime:image.mime},{requiresPrivateAccess:isPrivateItem(source,state.project,rules)});
    });},
    readImage(imageId,options={}){return readBounded(async()=>{
      // Image GETs inspect committed state only. Recovery and staged-upload
      // expiry belong to startup/retry and existing project mutation paths.
      const record=await run(async()=>authorizeImage((await readState()).state,imageId,options.includePrivate===true));
      // Only encrypted object bytes leave the mutation queue. The immutable
      // object key is the generation, so moves can never reuse an old cache hit.
      const encrypted=await imageCache.read(record.key,()=>objects.get(record.key));
      let image;
      try{
        const original={bytes:decodePhoto(record,encrypted),mime:record.mime};
        if(options.variant==='card'){
          const generation=`${record.key}:${record.digest}:${CARD_VERSION}`;
          const aad=`nas-storage:variant:${generation}`;
          const cached=await cardCache.read(generation,async()=>{
            let result;
            try{result=await transformCard(original);}catch{/* Unsupported work falls back to the exact original. */}
            const valid=result&&['image/jpeg','image/png'].includes(result.mime)&&result.bytes instanceof Uint8Array&&result.bytes.length>0&&result.bytes.length<=original.bytes.length;
            const selected=valid?result:original;
            return Buffer.from(JSON.stringify({mime:selected.mime,envelope:encryptBytes(Buffer.from(selected.bytes),key,aad)}));
          });
          const variant=JSON.parse(cached.toString());
          image={bytes:decryptBytes(variant.envelope,key,aad),mime:variant.mime};
        }else image=original;
      }catch(error){imageCache.discard(record.key);throw error;}
      return run(async()=>{
        const current=authorizeImage((await readState()).state,imageId,options.includePrivate===true);
        if(current.key!==record.key||current.digest!==record.digest||current.ownerId!==record.ownerId||current.mime!==record.mime)throw new StorageError('NOT_FOUND');
        return image;
      });
    }).catch(error=>{throw safeError(error);});},
    backup(){return run(async()=>{
      const {state}=await resume();const images={};
      for(const item of state.project.items){if(!item.imagePath)continue;const record=state.images[item.imagePath];if(!record)throw new StorageError();images[item.imagePath]={bytes:decodePhoto(record,await objects.get(record.key)),mime:record.mime};}
      return {format:'nas-storage-backup',version:1,project:projection(state,true),images};
    });},
    importProject(project,options={}){return run(async()=>{
      if(options.includePrivate!==true)throw new StorageError('FORBIDDEN');
      if(project?.scope==='ordinary'||project?.publicProject||project?.format||project?.privacy?.locked||(project?.privacy?.required&&!project?.privacy?.enabled))throw new StorageError('INVALID_PROJECT');
      let snapshot=await resume();
      if(snapshot.state.project.items.length||snapshot.state.project.categories.length||snapshot.state.project.locations.length||snapshot.state.projectRevision!==0)throw new StorageError('NOT_EMPTY');
      const validated=validateProject(project,{allowImagePaths:true});const inputs=new Map();
      const classify=createPrivacyClassifier(validated,rules);
      for(const item of validated.items)if(item.imagePath){
        if(!Object.hasOwn(options.images||{},item.imagePath))throw new StorageError('INVALID_IMAGE');
        const raw=options.images[item.imagePath];inputs.set(item.imagePath,sniffImage(raw?.bytes,raw?.mime));
      }
      // Validate all input before writing. Each bound item receives its own
      // image ID, even when the source project reused one local file.
      for(const item of validated.items){
        if(item.imagePath){const uploaded=await stageImage(inputs.get(item.imagePath));item.imagePath=uploaded.imageId;}
        item.isPrivate=classify(item);
      }
      snapshot=await resume();
      // Another process might have imported while this process staged images.
      if(snapshot.state.projectRevision!==0)throw new StorageError('NOT_EMPTY');
      const canonical=validateProject(validated);
      return projection((await commitProject(snapshot,canonical)).state,true);
    });},
    retryPending(){return run(async()=>{const {state}=await resume();return {ok:true,...(state.pending?.phase==='cleanup'?{cleanupPending:true}:{})};});},
    close(){return cardExecutor.close();}
  };
}
module.exports={createInventoryService};
