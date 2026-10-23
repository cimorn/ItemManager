'use strict';
const {StorageError}=require('./errors');
function clone(value) { return value==null ? value : JSON.parse(JSON.stringify(value)); }
function createMemoryRepository() {
  let current=null;
  return {
    async read(){return clone(current);},
    async compareAndSwap(expectedRevision,next){
      if((current?.revision||0)!==expectedRevision) return false;
      if(next?.revision!==expectedRevision+1) throw new StorageError('INVALID_PROJECT');
      current=clone(next);return true;
    },
    async close(){}
  };
}
async function createMongoRepository({uri,database='storage'}) {
  if(typeof uri!=='string'||!/^mongodb(?:\+srv)?:\/\//.test(uri)||database!=='storage') throw new StorageError('INVALID_CONFIG');
  let client;
  try {
    const {MongoClient}=require('mongodb');
    client=new MongoClient(uri,{serverSelectionTimeoutMS:10000,connectTimeoutMS:10000});
    await client.connect();const collection=client.db(database).collection('inventory');
    try {await collection.insertOne({_id:'inventory',revision:0,envelope:null});}catch(error){if(error.code!==11000) throw error;}
    return {
      async read(){
        try {const record=await collection.findOne({_id:'inventory'});return record?.envelope ? {revision:record.revision,envelope:record.envelope} : null;}
        catch {throw new StorageError();}
      },
      async compareAndSwap(expectedRevision,next){
        if(next?.revision!==expectedRevision+1) throw new StorageError('INVALID_PROJECT');
        try {const result=await collection.updateOne({_id:'inventory',revision:expectedRevision},{$set:{revision:next.revision,envelope:next.envelope}});return result.matchedCount===1;}
        catch {throw new StorageError();}
      },
      async close(){await client.close();}
    };
  } catch {await client?.close().catch(()=>{});throw new StorageError();}
}
module.exports={createMemoryRepository,createMongoRepository};
