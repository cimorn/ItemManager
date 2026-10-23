// @vitest-environment node
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {createHmac,createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
function load(name){try{return require(name);}catch(error){if(error.code==='MODULE_NOT_FOUND')return {};throw error;}}
const {createOssStore,createMemoryObjectStore}=load('../../server/oss-store');
const {createMemoryRepository,createMongoRepository}=load('../../server/repository');
const {normalizeKey,encryptBytes,decryptBytes}=load('../../server/crypto');
const encode=value=>value.split('/').map(x=>encodeURIComponent(x).replace(/[!'()*]/g,char=>`%${char.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
function expectedAuth(method,key,headers){
  const timestamp=headers['x-oss-date'];const date=timestamp.slice(0,8);const scope=`${date}/cn-hangzhou/oss/aliyun_v4_request`;
  const names=Object.keys(headers).filter(x=>x.startsWith('x-oss-')||x==='content-type'||x==='content-md5').sort();
  const canonical=`${method}\n${encode('/fixture-bucket/'+key)}\n\n${names.map(name=>`${name}:${headers[name].trim()}\n`).join('')}\n\nUNSIGNED-PAYLOAD`;
  const input=`OSS4-HMAC-SHA256\n${timestamp}\n${scope}\n${createHash('sha256').update(canonical).digest('hex')}`;
  let derived=Buffer.from('aliyun_v4fixture-secret');for(const value of [date,'cn-hangzhou','oss','aliyun_v4_request'])derived=createHmac('sha256',derived).update(value).digest();
  return `OSS4-HMAC-SHA256 Credential=fixture-id/${scope},Signature=${createHmac('sha256',derived).update(input).digest('hex')}`;
}

describe('storage transport boundaries',()=>{
  it('implements atomic memory CAS and returns independent copies',async()=>{
    const repository=createMemoryRepository();expect(await repository.read()).toBe(null);
    expect(await repository.compareAndSwap(0,{revision:1,envelope:{value:'first'}})).toBe(true);
    expect(await repository.compareAndSwap(0,{revision:1,envelope:{value:'stale'}})).toBe(false);
    const read=await repository.read();read.envelope.value='mutated';expect((await repository.read()).envelope.value).toBe('first');
  });
  it('requires a strong explicit encryption key and authenticates AAD and modified ciphertext',()=>{
    expect(()=>normalizeKey('password')).toThrow();const key=Buffer.alloc(32,7);
    const encrypted=encryptBytes(Buffer.from('private payload'),key,'image-a');
    expect(decryptBytes(encrypted,key,'image-a').toString()).toBe('private payload');
    expect(()=>decryptBytes(encrypted,key,'image-b')).toThrow();
    encrypted.ciphertext=Buffer.from('tampered').toString('base64');expect(()=>decryptBytes(encrypted,key,'image-a')).toThrow();
  });
  it('rejects weak database configuration instead of silently choosing memory',async()=>{
    await expect(createMongoRepository({uri:'http://example.test',database:'storage'})).rejects.toMatchObject({code:'INVALID_CONFIG'});
    await expect(createMongoRepository({uri:'mongodb://127.0.0.1',database:'kstorage'})).rejects.toMatchObject({code:'INVALID_CONFIG'});
    await expect(createMongoRepository({uri:'mongodb://%',database:'storage'})).rejects.toMatchObject({code:'STORAGE_UNAVAILABLE',message:'存储暂时不可用，请稍后重试'});
  });
  it('rejects all object keys outside Storage and escaped traversal',async()=>{
    const store=createMemoryObjectStore();
    for(const key of ['Other/file','Storage/../secret','Storage/%2e%2e/secret','Storage/a\\b','Storage//a','https://evil.test/Storage/a','Storage/./a','Storage/%252e%252e/a','Storage/a?x=1']){
      await expect(store.put(key,Buffer.from('x'))).rejects.toMatchObject({code:'INVALID_IMAGE'});
    }
  });
  it('refuses arbitrary remote endpoint URLs and unencrypted transport',()=>{
    for(const endpoint of ['https://example.test','http://bucket.oss-cn-hangzhou.aliyuncs.com','https://oss-cn-hangzhou.aliyuncs.com/other','https://user:pass@oss-cn-hangzhou.aliyuncs.com']){
      expect(()=>createOssStore({endpoint,bucket:'fixture-bucket',region:'cn-hangzhou',accessKeyId:'fixture-id',accessKeySecret:'fixture-secret'})).toThrow();
    }
  });
  it('signs real HTTP put/get/head/copy/delete against a loopback fixture',async()=>{
    const data=new Map();let requests=0;const errors=[];
    const server=createServer(async(req,res)=>{
      requests++;const key=decodeURIComponent(req.url.slice(1));
      if(req.headers.authorization!==expectedAuth(req.method,key,req.headers))errors.push('bad signature');
      if(!key.startsWith('Storage/'))errors.push('bad root');
      if(req.method==='PUT'){
        if(req.headers['x-oss-copy-source']){
          const source=decodeURIComponent(req.headers['x-oss-copy-source']).slice('/fixture-bucket/'.length);
          data.set(key,Buffer.from(data.get(source)));res.end('<CopyObjectResult><ETag>fixture</ETag></CopyObjectResult>');return;
        }
        const chunks=[];for await(const chunk of req)chunks.push(chunk);data.set(key,Buffer.concat(chunks));res.end();return;
      }
      if(req.method==='DELETE'){data.delete(key);res.statusCode=204;res.end();return;}
      if(!data.has(key)){res.statusCode=404;res.end();return;}
      res.setHeader('content-length',data.get(key).length);res.end(req.method==='HEAD'?undefined:data.get(key));
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try{
      const store=createOssStore({endpoint:`http://127.0.0.1:${server.address().port}`,bucket:'fixture-bucket',region:'cn-hangzhou',accessKeyId:'fixture-id',accessKeySecret:'fixture-secret',allowInsecureLocalTest:true});
      await store.put('Storage/工具/a.enc',Buffer.from('ciphertext'),'application/octet-stream');
      expect((await store.get('Storage/工具/a.enc')).toString()).toBe('ciphertext');
      expect(await store.head('Storage/工具/a.enc')).toEqual({size:10});
      await store.copy('Storage/工具/a.enc','Storage/新工具/b.enc');
      expect((await store.get('Storage/新工具/b.enc')).toString()).toBe('ciphertext');
      await store.delete('Storage/工具/a.enc');await store.delete('Storage/工具/a.enc');
      expect(data.size).toBe(1);expect(requests).toBe(7);expect(errors).toEqual([]);
    }finally{await new Promise(resolve=>server.close(resolve));}
  });
});
