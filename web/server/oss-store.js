'use strict';
const {createHash,createHmac}=require('node:crypto');
const {StorageError}=require('./errors');
const MAX_OBJECT=30*1024*1024;
function validateKey(key){
  if(typeof key!=='string'||key.length>2048||!key.startsWith('Storage/')||key==='Storage/')throw new StorageError('INVALID_IMAGE');
  let decoded=key;
  for(let round=0;round<4;round++){
    if(/[\\\u0000-\u001f?#]/.test(decoded)||decoded.split('/').some(segment=>!segment||segment==='.'||segment==='..'))throw new StorageError('INVALID_IMAGE');
    let next;try{next=decodeURIComponent(decoded);}catch{throw new StorageError('INVALID_IMAGE');}
    if(next===decoded)return key;decoded=next;
  }
  throw new StorageError('INVALID_IMAGE');
}
function createMemoryObjectStore(){
  const entries=new Map();
  return {
    async put(key,bytes){validateKey(key);if(bytes.length>MAX_OBJECT)throw new StorageError('TOO_LARGE');entries.set(key,Buffer.from(bytes));},
    async get(key){validateKey(key);if(!entries.has(key))throw new StorageError('NOT_FOUND');return Buffer.from(entries.get(key));},
    async copy(source,target){validateKey(source);validateKey(target);if(!entries.has(source))throw new StorageError('NOT_FOUND');entries.set(target,Buffer.from(entries.get(source)));},
    async delete(key){validateKey(key);entries.delete(key);},
    async head(key){validateKey(key);if(!entries.has(key))throw new StorageError('NOT_FOUND');return {size:entries.get(key).length};},
    keys(){return [...entries.keys()];}
  };
}
function encodePath(value){return value.split('/').map(segment=>encodeURIComponent(segment).replace(/[!'()*]/g,char=>`%${char.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');}
function createOssStore(config){
  let endpoint;try{endpoint=new URL(config.endpoint.includes('://')?config.endpoint:`https://${config.endpoint}`);}catch{throw new StorageError('INVALID_CONFIG');}
  const {bucket,region,accessKeyId,accessKeySecret,securityToken}=config;
  const local=config.allowInsecureLocalTest===true&&['127.0.0.1','[::1]','localhost'].includes(endpoint.hostname);
  if(!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket||'')||!/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(region||'')||typeof accessKeyId!=='string'||!accessKeyId||typeof accessKeySecret!=='string'||!accessKeySecret)throw new StorageError('INVALID_CONFIG');
  if(endpoint.username||endpoint.password||endpoint.search||endpoint.hash||endpoint.pathname!=='/')throw new StorageError('INVALID_CONFIG');
  if(!local){
    const host=endpoint.hostname;const bare=host.startsWith(`${bucket}.`)?host.slice(bucket.length+1):host;
    if(endpoint.protocol!=='https:'||endpoint.port||!/^oss-[a-z0-9-]+\.aliyuncs\.com$/.test(bare))throw new StorageError('INVALID_CONFIG');
    endpoint.hostname=`${bucket}.${bare}`;
  }
  const hmac=(secret,value)=>createHmac('sha256',secret).update(value).digest();
  async function request(method,key,{bytes,headers:extra={},copy=false}={}){
    validateKey(key);const headers={...extra,'x-oss-content-sha256':'UNSIGNED-PAYLOAD','x-oss-date':new Date().toISOString().replace(/[-:]|\.\d{3}/g,'')};
    if(securityToken)headers['x-oss-security-token']=securityToken;
    const timestamp=headers['x-oss-date'];const date=timestamp.slice(0,8);const scope=`${date}/${region}/oss/aliyun_v4_request`;
    const canonicalHeaders=Object.keys(headers).sort().map(name=>`${name}:${String(headers[name]).trim()}\n`).join('');
    const canonical=`${method}\n${encodePath(`/${bucket}/${key}`)}\n\n${canonicalHeaders}\n\nUNSIGNED-PAYLOAD`;
    const toSign=`OSS4-HMAC-SHA256\n${timestamp}\n${scope}\n${createHash('sha256').update(canonical).digest('hex')}`;
    let signingKey=Buffer.from(`aliyun_v4${accessKeySecret}`);for(const value of [date,region,'oss','aliyun_v4_request'])signingKey=hmac(signingKey,value);
    headers.authorization=`OSS4-HMAC-SHA256 Credential=${accessKeyId}/${scope},Signature=${hmac(signingKey,toSign).toString('hex')}`;
    try{
      const response=await fetch(`${endpoint.origin}/${encodePath(key)}`,{method,headers,body:bytes,redirect:'error',signal:AbortSignal.timeout(20000)});
      if(method==='DELETE'&&response.status===404){await response.body?.cancel();return {};}
      if(!response.ok){await response.body?.cancel();throw new StorageError(response.status===404?'NOT_FOUND':'STORAGE_UNAVAILABLE');}
      const declared=Number(response.headers.get('content-length'));
      if(method==='HEAD'){
        if(!Number.isSafeInteger(declared)||declared<0||declared>MAX_OBJECT)throw new StorageError();
        return {size:declared};
      }
      if(declared>MAX_OBJECT){await response.body?.cancel();throw new StorageError();}
      const chunks=[];let length=0;
      if(response.body)for await(const chunk of response.body){length+=chunk.length;if(length>MAX_OBJECT)throw new StorageError();chunks.push(chunk);}
      const body=Buffer.concat(chunks);
      if(copy&&(!/<CopyObjectResult[\s>]/.test(body.toString('utf8'))||/<Error[\s>]/.test(body.toString('utf8'))))throw new StorageError();
      return body;
    }catch(error){if(error instanceof StorageError)throw error;throw new StorageError();}
  }
  return {
    async put(key,bytes,mime='application/octet-stream'){
      if(!Buffer.isBuffer(bytes)&&!(bytes instanceof Uint8Array))throw new StorageError('INVALID_IMAGE');
      if(bytes.length>MAX_OBJECT)throw new StorageError('TOO_LARGE');
      await request('PUT',key,{bytes,headers:{'content-type':mime,'content-md5':createHash('md5').update(bytes).digest('base64')}});
    },
    async get(key){return request('GET',key);},
    async head(key){return request('HEAD',key);},
    async copy(source,target){validateKey(source);await request('PUT',target,{headers:{'x-oss-copy-source':`/${bucket}/${encodePath(source)}`},copy:true});},
    async delete(key){await request('DELETE',key);}
  };
}
module.exports={createMemoryObjectStore,createOssStore};
