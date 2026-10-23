// @vitest-environment node
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
const require = createRequire(import.meta.url);
function load(name) { try { return require(name); } catch(error) { if(error.code==='MODULE_NOT_FOUND') return {}; throw error; } }
const { createInventoryService } = load('../../server/inventory-service');
const { createMemoryRepository } = load('../../server/repository');
const { createMemoryObjectStore } = load('../../server/oss-store');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=', 'base64');
function fixture() {
  return { meta: {name:'家中物品',tagPrefixes:{normal:'N',secret:'SECRET'}}, categories:[
    {id:'normal',name:'工具',parentId:null,level:1}, {id:'empty',name:'空分类',parentId:null,level:1},
    {id:'secret',name:'Look',parentId:null,level:1}, {id:'secret-child',name:'私密收藏',parentId:'secret',level:2}
  ], locations:[{id:'desk',name:'书桌',parentId:null,level:1},{id:'hidden-location',name:'隐藏位置',parentId:null,level:1}], items:[
    {id:'ordinary',name:'剪刀',categoryId:'normal',locationId:'desk',tags:[],imagePath:''},
    {id:'private',name:'秘密物品',categoryId:'secret-child',locationId:'hidden-location',tags:['MY-SECRET'],imagePath:''}
  ] };
}
function setup(options={}) {
  const repository = options.repository || createMemoryRepository();
  const objects = options.objects || createMemoryObjectStore();
  const encryptionKey = options.encryptionKey || randomBytes(32);
  return {repository,objects,encryptionKey,service:createInventoryService({repository,objects,encryptionKey,rules:options.rules})};
}
async function seeded(options={}) {
  const context=setup(options);
  await context.service.importProject(fixture(),{includePrivate:true});
  return context;
}

describe('NAS encrypted inventory service', () => {
  it('projects ordinary data without private IDs, category branches, locations, or prefixes',async()=>{
    const {service}=await seeded();
    const project=await service.getProject({includePrivate:false});
    expect(project.scope).toBe('ordinary');
    expect(project.paths.projectDir).toBe('nas');
    expect(project.categories.map(x=>x.id)).toEqual(['normal','empty']);
    expect(project.items.map(x=>x.id)).toEqual(['ordinary']);
    expect(project.items[0].isPrivate).toBe(false);
    expect(JSON.stringify(project)).not.toMatch(/secret|私密|隐藏位置|MY-SECRET|秘密物品/);
    expect((await service.getProject({includePrivate:true})).items[1].isPrivate).toBe(true);
  });
  it('does not expose private-only ancestors through an empty category or location descendant',async()=>{
    const {service}=setup();const project=fixture();
    project.categories=project.categories.filter(x=>!x.id.startsWith('secret'));
    project.categories.push({id:'sensitive-root',name:'敏感分类',parentId:null,level:1},{id:'sensitive-empty',name:'敏感空子分类',parentId:'sensitive-root',level:2});
    project.locations.push({id:'sensitive-empty-location',name:'敏感空位置',parentId:'hidden-location',level:2});
    project.items[1].categoryId='sensitive-root';project.items[1].isPrivate=true;
    await service.importProject(project,{includePrivate:true});
    const visible=await service.getProject();
    expect(visible.categories.map(x=>x.id)).toEqual(['normal','empty']);
    expect(visible.locations.map(x=>x.id)).toEqual(['desk']);
    expect(JSON.stringify(visible)).not.toMatch(/sensitive|hidden-location|敏感|秘密物品/);
    await service.saveProject(visible);
    const all=await service.getProject({includePrivate:true});
    expect(all.categories.some(x=>x.id==='sensitive-empty')).toBe(true);
    expect(all.locations.some(x=>x.id==='sensitive-empty-location')).toBe(true);
  });
  it('preserves hidden records and their catalogs during ordinary partial save',async()=>{
    const {service}=await seeded();
    const visible=await service.getProject();
    visible.items[0].name='新剪刀';
    visible.categories=[];
    visible.locations=[];
    const result=await service.saveProject(visible);
    expect(result.items[0].name).toBe('新剪刀');
    const all=await service.getProject({includePrivate:true});
    expect(all.items.find(x=>x.id==='private').name).toBe('秘密物品');
    expect(all.categories.some(x=>x.id==='secret-child')).toBe(true);
    expect(all.meta.tagPrefixes.secret).toBe('SECRET');
  });
  it('rejects stale saves and attempts to overwrite hidden IDs',async()=>{
    const {service}=await seeded();
    const visible=await service.getProject();
    await service.saveProject(visible);
    await expect(service.saveProject(visible)).rejects.toMatchObject({code:'CONFLICT',status:409});
    const next=await service.getProject();
    next.items.push({id:'private',name:'猜测',tags:[],imagePath:''});
    await expect(service.saveProject(next)).rejects.toMatchObject({code:'FORBIDDEN',status:403});
  });
  it('encrypts canonical state and image bytes and denies staged or hidden image access',async()=>{
    const {service,repository,objects}=await seeded();
    const {imageId}=await service.uploadImage({bytes:png,mime:'image/png'});
    await expect(service.readImage(imageId,{includePrivate:true})).rejects.toMatchObject({code:'NOT_FOUND'});
    let all=await service.getProject({includePrivate:true});
    all.items[1].imagePath=imageId;
    await service.saveProject(all,{includePrivate:true});
    await expect(service.readImage(imageId)).rejects.toMatchObject({code:'NOT_FOUND'});
    expect((await service.readImage(imageId,{includePrivate:true})).bytes).toEqual(png);
    expect(JSON.stringify(await repository.read())).not.toMatch(/秘密物品|Look|hidden-location/);
    const stored=await objects.get(objects.keys()[0]);
    expect(stored.includes(png)).toBe(false);
    expect(stored.subarray(0,8)).not.toEqual(png.subarray(0,8));
  });
  it('refuses attaching an already bound photo to another item',async()=>{
    const {service}=await seeded();
    const {imageId}=await service.uploadImage({bytes:png,mime:'image/png'});
    let all=await service.getProject({includePrivate:true});
    all.items[1].imagePath=imageId;
    await service.saveProject(all,{includePrivate:true});
    let visible=await service.getProject();
    visible.items[0].imagePath=imageId;
    await expect(service.saveProject(visible)).rejects.toMatchObject({code:'INVALID_IMAGE'});
  });
  it('copies on category rename, verifies bytes, commits new path, then deletes old object',async()=>{
    const {service,objects}=await seeded();
    const {imageId}=await service.uploadImage({bytes:png,mime:'image/png'});
    let project=await service.getProject();project.items[0].imagePath=imageId;
    await service.saveProject(project);
    const oldKey=objects.keys()[0];expect(oldKey).toContain('Storage/');
    project=await service.getProject();project.categories[0].name='新工具';
    await service.saveProject(project);
    expect(objects.keys()).toHaveLength(1);
    expect(objects.keys()[0]).not.toBe(oldKey);
    expect(decodeURIComponent(objects.keys()[0])).toContain('新工具');
    expect((await service.readImage(imageId)).bytes).toEqual(png);
    project=await service.getProject();project.items=[];
    await service.saveProject(project);
    expect(objects.keys()).toHaveLength(0);
  });
  it('resumes a failed copy after restart while keeping the old object and old canonical project',async()=>{
    const context=await seeded();const {service,objects,repository,encryptionKey}=context;
    const {imageId}=await service.uploadImage({bytes:png,mime:'image/png'});
    let project=await service.getProject();project.items[0].imagePath=imageId;await service.saveProject(project);
    const oldKey=objects.keys()[0];const originalCopy=objects.copy;
    objects.copy=async()=>{throw new Error('upstream raw secret error');};
    project=await service.getProject();project.categories[0].name='移动后';
    await expect(service.saveProject(project)).rejects.toMatchObject({code:'STORAGE_UNAVAILABLE',status:503,message:'存储暂时不可用，请稍后重试'});
    expect(objects.keys()).toContain(oldKey);
    objects.copy=originalCopy;
    const restarted=setup({objects,repository,encryptionKey}).service;
    await restarted.retryPending();
    expect((await restarted.getProject()).categories[0].name).toBe('移动后');
    expect(objects.keys()).not.toContain(oldKey);
    expect((await restarted.readImage(imageId)).bytes).toEqual(png);
  });
  it('resumes deletion failure without deleting any unrelated object',async()=>{
    const {service,objects,repository,encryptionKey}=await seeded();
    await objects.put('Storage/unrelated.enc',Buffer.from('untouched'));
    const {imageId}=await service.uploadImage({bytes:png,mime:'image/png'});
    let project=await service.getProject();project.items[0].imagePath=imageId;await service.saveProject(project);
    const originalDelete=objects.delete;objects.delete=async()=>{throw new Error('unavailable');};
    project=await service.getProject();project.items=[];
    const saved=await service.saveProject(project);
    expect(saved.storageWarning).toMatchObject({code:'CLEANUP_PENDING'});
    expect((await service.getProject()).items).toEqual([]);
    objects.delete=originalDelete;
    const restarted=setup({objects,repository,encryptionKey}).service;await restarted.retryPending();
    expect((await restarted.getProject()).items).toEqual([]);
    expect(objects.keys()).toEqual(['Storage/unrelated.enc']);
  });
  it('uses configured privacy tags and permits explicit transition from public to private',async()=>{
    const {service}=await seeded({rules:{tags:['N-001']}});
    const project=await service.getProject();project.items[0].tags=['N-001'];
    const saved=await service.saveProject(project);
    expect(saved.items).toEqual([]);
    expect((await service.getProject({includePrivate:true})).items[0].isPrivate).toBe(true);
  });
  it('normalizes compact privacy tag codes consistently with desktop tags',async()=>{
    const {service}=await seeded({rules:{tags:['N_1']}});
    const project=await service.getProject();project.items[0].tags=['N001'];
    expect((await service.saveProject(project)).items).toEqual([]);
  });
  it('keeps Chinese category names as real object folder segments',async()=>{
    const {service,objects}=setup();const project=fixture();project.categories[0].name='数码';
    project.categories.push({id:'keyboard',name:'键盘',level:2,parentId:'normal'});project.items[0].categoryId='keyboard';
    await service.importProject(project,{includePrivate:true});
    const {imageId}=await service.uploadImage({bytes:png,mime:'image/png'});
    const visible=await service.getProject();visible.items[0].imagePath=imageId;await service.saveProject(visible);
    expect(objects.keys()[0]).toContain('Storage/数码/键盘/');
    expect(objects.keys()[0]).not.toContain('%E');
  });
  it('does not let ordinary metadata overwrite private category prefixes',async()=>{
    const {service}=await seeded();const project=await service.getProject();project.meta.tagPrefixes.secret='GUESS';
    await expect(service.saveProject(project)).rejects.toMatchObject({code:'FORBIDDEN'});
  });
  it('cleans only expired unbound image uploads, and retains bound photos',async()=>{
    const context=await seeded();const {service,objects}=context;
    const originalNow=Date.now();const timer=vi.spyOn(Date,'now').mockReturnValue(originalNow);
    try{
      const {imageId}=await service.uploadImage({bytes:png,mime:'image/png'});
      const bound=await service.uploadImage({bytes:png,mime:'image/png'});
      const project=await service.getProject();project.items[0].imagePath=bound.imageId;await service.saveProject(project);
      expect(objects.keys()).toHaveLength(2);
      timer.mockReturnValue(originalNow+24*60*60*1000-1);await service.retryPending();expect(objects.keys()).toHaveLength(2);
      timer.mockReturnValue(originalNow+24*60*60*1000+1);await service.retryPending();expect(objects.keys()).toHaveLength(1);
      expect((await service.readImage(bound.imageId)).bytes).toEqual(png);
      await expect(service.readImage(imageId,{includePrivate:true})).rejects.toMatchObject({code:'NOT_FOUND'});
    }finally{timer.mockRestore();}
  });
  it('retains original photos when copied bytes fail verification',async()=>{
    const {service,objects}=await seeded();const {imageId}=await service.uploadImage({bytes:png,mime:'image/png'});
    let project=await service.getProject();project.items[0].imagePath=imageId;await service.saveProject(project);
    const original=objects.keys()[0];const copy=objects.copy;objects.copy=async(source,target)=>objects.put(target,Buffer.from('corrupt'));
    project=await service.getProject();project.categories[0].name='损坏复制';
    await expect(service.saveProject(project)).rejects.toMatchObject({code:'STORAGE_UNAVAILABLE'});
    expect(objects.keys()).toContain(original);
    objects.copy=copy;await service.retryPending();expect((await service.readImage(imageId)).bytes).toEqual(png);
  });
  it('preserves deferred cleanup through another save while current image reads remain available',async()=>{
    const {service,objects}=await seeded();const {imageId}=await service.uploadImage({bytes:png,mime:'image/png'});
    let project=await service.getProject();project.items[0].imagePath=imageId;await service.saveProject(project);
    const originalDelete=objects.delete;objects.delete=async()=>{throw new Error('temporary');};
    project=await service.getProject();project.categories[0].name='第一次移动';
    const first=await service.saveProject(project);expect(first.storageWarning.code).toBe('CLEANUP_PENDING');
    expect((await service.readImage(imageId)).bytes).toEqual(png);
    project=await service.getProject();project.categories[0].name='第二次移动';
    const second=await service.saveProject(project);expect(second.revision).toBe(first.revision+1);
    expect((await service.retryPending()).cleanupPending).toBe(true);
    objects.delete=originalDelete;await service.retryPending();
    expect(objects.keys()).toHaveLength(1);expect(objects.keys()[0]).toContain('第二次移动');
  });
  it('retains the original object if database commit conflicts after copy, then resumes safely',async()=>{
    const {service,objects,repository}=await seeded();const {imageId}=await service.uploadImage({bytes:png,mime:'image/png'});
    let project=await service.getProject();project.items[0].imagePath=imageId;await service.saveProject(project);
    const oldKey=objects.keys()[0];const originalCas=repository.compareAndSwap;let calls=0;
    repository.compareAndSwap=async(expected,next)=>{if(++calls===2)return false;return originalCas(expected,next);};
    project=await service.getProject();project.categories[0].name='提交冲突';
    await expect(service.saveProject(project)).rejects.toMatchObject({code:'CONFLICT'});
    expect(objects.keys()).toContain(oldKey);repository.compareAndSwap=originalCas;
    await service.retryPending();expect(objects.keys()).not.toContain(oldKey);expect((await service.readImage(imageId)).bytes).toEqual(png);
  });
  it('supports removing a public tag prefix while preserving private prefixes',async()=>{
    const {service}=await seeded();const project=await service.getProject();delete project.meta.tagPrefixes.normal;
    await service.saveProject(project);const all=await service.getProject({includePrivate:true});
    expect(all.meta.tagPrefixes.normal).toBeUndefined();expect(all.meta.tagPrefixes.secret).toBe('SECRET');
  });
  it('rejects IDs shared by different entity types and unsafe folder names',async()=>{
    const {service}=setup();const duplicate=fixture();duplicate.items[0].id='normal';
    await expect(service.importProject(duplicate,{includePrivate:true})).rejects.toMatchObject({code:'INVALID_PROJECT'});
    for(const name of ['..','../其他','a\\b','a%2Fb']){const project=fixture();project.categories[0].name=name;
      await expect(service.importProject(project,{includePrivate:true})).rejects.toMatchObject({code:'INVALID_PROJECT'});
    }
  });
  it('accepts a BMP with a valid bitmap header and rejects forged BMP data',async()=>{
    const {service}=await seeded();const bmp=Buffer.alloc(58);bmp.write('BM');bmp.writeUInt32LE(58,2);bmp.writeUInt32LE(54,10);bmp.writeUInt32LE(40,14);bmp.writeInt32LE(1,18);bmp.writeInt32LE(1,22);bmp.writeUInt16LE(1,26);bmp.writeUInt16LE(24,28);bmp.writeUInt32LE(4,34);
    const {imageId}=await service.uploadImage({bytes:bmp,mime:'image/bmp'});const project=await service.getProject();project.items[0].imagePath=imageId;await service.saveProject(project);
    expect(await service.readImage(imageId)).toEqual({bytes:bmp,mime:'image/bmp'});
    const forged=Buffer.from(bmp);forged.writeUInt32LE(8000,10);
    await expect(service.uploadImage({bytes:forged,mime:'image/bmp'})).rejects.toMatchObject({code:'INVALID_IMAGE'});
    await expect(service.uploadImage({bytes:Buffer.from('BMfake'),mime:'image/bmp'})).rejects.toMatchObject({code:'INVALID_IMAGE'});
  });
  it('preserves imported history and stamps only later item edits with server time',async()=>{
    const {service}=setup();const project=fixture();
    project.items[0].createdAt='2026-01-02T03:04:05.000Z';project.items[0].updatedAt='2026-10-16T01:02:03.000Z';
    await service.importProject(project,{includePrivate:true});
    let visible=await service.getProject();
    expect(visible.items[0]).toMatchObject({createdAt:project.items[0].createdAt,updatedAt:project.items[0].updatedAt});
    // Older clients can omit dates, but a no-op save cannot erase them.
    delete visible.items[0].createdAt;delete visible.items[0].updatedAt;
    await service.saveProject(visible);
    visible=await service.getProject();
    expect(visible.items[0]).toMatchObject({createdAt:project.items[0].createdAt,updatedAt:project.items[0].updatedAt});
    const serverTime='2026-10-22T12:00:00.000Z';
    vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(serverTime));
    try{
      visible.items[0].name='保留创建时间';
      visible.items[0].createdAt='2099-01-01T00:00:00.000Z';visible.items[0].updatedAt='2099-01-01T00:00:00.000Z';
      await service.saveProject(visible);
      visible=await service.getProject();
      expect(visible.items[0]).toMatchObject({createdAt:project.items[0].createdAt,updatedAt:serverTime});
      vi.setSystemTime(new Date('2026-10-23T12:00:00.000Z'));
      await service.saveProject(visible);
      expect((await service.getProject()).items[0]).toMatchObject({createdAt:project.items[0].createdAt,updatedAt:serverTime});
    }finally{vi.useRealTimers();}
    const invalid=await service.getProject();invalid.items[0].createdAt='x'.repeat(65);
    await expect(service.saveProject(invalid)).rejects.toMatchObject({code:'INVALID_PROJECT'});
  });
  it.each([true,false])('retains hidden timestamp metadata during ordinary saves (known dates: %s)',async knownDates=>{
    const {service}=setup();const project=fixture();
    if(knownDates)Object.assign(project.items[1],{createdAt:'2026-01-02T03:04:05.000Z',updatedAt:'2026-10-16T01:02:03.000Z'});
    await service.importProject(project,{includePrivate:true});
    const originalHidden=(await service.getProject({includePrivate:true})).items.find(item=>item.id==='private');
    let visible=await service.getProject();
    await service.saveProject(visible);
    expect((await service.getProject({includePrivate:true})).items.find(item=>item.id==='private')).toEqual(originalHidden);
    visible=await service.getProject();visible.items[0].name='普通物品修改';
    visible.categories=[];visible.locations=[];
    await service.saveProject(visible);
    const all=await service.getProject({includePrivate:true});
    expect(all.items.find(item=>item.id==='private')).toEqual(originalHidden);
    expect(all.items.find(item=>item.id==='ordinary').updatedAt).toEqual(expect.any(String));
    expect(JSON.stringify(await service.getProject())).not.toMatch(/secret|秘密物品|隐藏位置/);
  });
  it('refuses ordinary projections and encrypted wrappers even when import bypasses HTTP',async()=>{
    const {service}=setup();
    for(const markers of [{scope:'ordinary'},{publicProject:{items:[]}},{format:'item-manager-private-project'},{format:'encrypted-project'},{privacy:{required:true,locked:true}}]){
      await expect(service.importProject({...fixture(),...markers},{includePrivate:true})).rejects.toMatchObject({code:'INVALID_PROJECT'});
    }
    expect((await service.getProject()).items).toEqual([]);
  });
  it('validates duplicate IDs, cycles, image magic and strict import completeness',async()=>{
    const {service}=setup();const project=fixture();project.items.push({...project.items[0]});
    await expect(service.importProject(project,{includePrivate:true})).rejects.toMatchObject({code:'INVALID_PROJECT'});
    const cyclic=fixture();cyclic.categories[0].parentId='normal';
    await expect(service.importProject(cyclic,{includePrivate:true})).rejects.toMatchObject({code:'INVALID_PROJECT'});
    await expect(service.uploadImage({bytes:Buffer.from('<svg/>'),mime:'image/png'})).rejects.toMatchObject({code:'INVALID_IMAGE'});
    const missing=fixture();missing.items[0].imagePath='images/missing.jpg';
    await expect(service.importProject(missing,{images:{},includePrivate:true})).rejects.toMatchObject({code:'INVALID_IMAGE'});
    expect((await service.getProject()).items).toEqual([]);
  });
  it('backs up only application data with complete image bytes and imports into an empty target',async()=>{
    const {service}=await seeded();const {imageId}=await service.uploadImage({bytes:png,mime:'image/png'});
    let project=await service.getProject({includePrivate:true});project.items[1].imagePath=imageId;await service.saveProject(project,{includePrivate:true});
    const data=await service.backup();
    expect(data.project.items).toHaveLength(2);
    expect(data.images[imageId]).toEqual({bytes:png,mime:'image/png'});
    expect(JSON.stringify(data)).not.toMatch(/encryptionKey|accessKeySecret|Storage\//);
    const target=setup().service;await target.importProject(data.project,{images:data.images,includePrivate:true});
    const restored=await target.getProject({includePrivate:true});
    expect((await target.readImage(restored.items[1].imagePath,{includePrivate:true})).bytes).toEqual(png);
    await expect(target.importProject(fixture(),{includePrivate:true})).rejects.toMatchObject({code:'NOT_EMPTY',status:409});
  });
  it('does not return an empty project when repository reads fail or the key is wrong',async()=>{
    const {repository,objects,encryptionKey}=await seeded();
    const incorrect=setup({repository,objects,encryptionKey:randomBytes(32)}).service;
    await expect(incorrect.getProject()).rejects.toMatchObject({code:'STORAGE_UNAVAILABLE',status:503});
    const failed=setup({repository:{read:async()=>{throw new Error('credential');},compareAndSwap:async()=>false},encryptionKey}).service;
    await expect(failed.getProject()).rejects.toMatchObject({code:'STORAGE_UNAVAILABLE'});
  });
});
