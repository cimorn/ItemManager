'use strict';
const {randomBytes,createCipheriv,createDecipheriv}=require('node:crypto');
const {StorageError}=require('./errors');

function normalizeKey(value) {
  let key;
  if(Buffer.isBuffer(value)||value instanceof Uint8Array) key=Buffer.from(value);
  else if(typeof value==='string' && /^[a-fA-F0-9]{64}$/.test(value)) key=Buffer.from(value,'hex');
  else if(typeof value==='string' && /^[A-Za-z0-9+/]{43}=$/.test(value)) key=Buffer.from(value,'base64');
  if(!key || key.length!==32) throw new StorageError('INVALID_CONFIG');
  return key;
}
function encryptBytes(bytes,key,aad) {
  const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',normalizeKey(key),iv);
  cipher.setAAD(Buffer.from(aad,'utf8'));
  const ciphertext=Buffer.concat([cipher.update(bytes),cipher.final()]);
  return {version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
}
function decryptBytes(envelope,key,aad) {
  try {
    if(!envelope || envelope.version!==1) throw new Error();
    const iv=Buffer.from(envelope.iv,'base64');const tag=Buffer.from(envelope.tag,'base64');
    if(iv.length!==12||tag.length!==16) throw new Error();
    const decipher=createDecipheriv('aes-256-gcm',normalizeKey(key),iv);decipher.setAAD(Buffer.from(aad,'utf8'));decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]);
  } catch { throw new StorageError('STORAGE_UNAVAILABLE'); }
}
module.exports={normalizeKey,encryptBytes,decryptBytes};
