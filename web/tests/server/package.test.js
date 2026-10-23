// @vitest-environment node
const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');
const {vendorRuntimeDependencies}=require('../../scripts/runtime-deps.cjs');
let root;
beforeEach(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'storage-package-'));});
afterEach(async()=>{await fs.rm(root,{recursive:true,force:true});});
it('vendors real runtime modules with resolved files rather than Windows directory junctions',async()=>{
 const target=path.join(root,'node_modules');
 const report=await vendorRuntimeDependencies({projectRoot:path.resolve(__dirname,'../..'),targetDir:target});
 expect(report.count).toBeGreaterThan(10);
 const {createRequire}=require('node:module'),resolve=createRequire(path.join(root,'package.json'));
 expect(typeof resolve('express')).toBe('function');expect(typeof resolve('mongodb').MongoClient).toBe('function');
 expect(typeof resolve('jpeg-js').decode).toBe('function');expect(typeof resolve('pngjs').PNG.sync.read).toBe('function');
 const express=await fs.lstat(path.join(target,'express'));expect(express.isSymbolicLink()).toBe(false);
// This integration copies the full runtime dependency tree (over 1,000 files).
// Allow filesystem work to finish while other test workers are running.
},30000);
