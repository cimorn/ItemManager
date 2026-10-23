const fs=require('node:fs/promises');
const path=require('node:path');
const {createRequire}=require('node:module');
const NAME=/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i;
async function packageRoot(name,from){
 const resolve=createRequire(path.join(from,'package.json'));let entry;
 try{entry=resolve.resolve(`${name}/package.json`);}catch{entry=resolve.resolve(name);}
 let dir=path.dirname(entry);
 for(let n=0;n<15;n++){
  try{const data=JSON.parse(await fs.readFile(path.join(dir,'package.json'),'utf8'));if(data.name===name)return {dir:await fs.realpath(dir),data};}catch{}
  const parent=path.dirname(dir);if(parent===dir)break;dir=parent;
 }
 throw Error('Runtime dependency could not be resolved');
}
async function vendorRuntimeDependencies({projectRoot,targetDir,roots=['express','mongodb','jpeg-js','pngjs']}){
 const root=await fs.realpath(projectRoot),target=path.resolve(targetDir);const packages=[];
 await fs.mkdir(target,{recursive:true});
 async function install(name,from,parentTarget){
  if(!NAME.test(name))throw Error('Invalid dependency name');
  const source=await packageRoot(name,from);let destination=path.join(target,name);
  async function matches(candidate){try{const data=JSON.parse(await fs.readFile(path.join(candidate,'package.json'),'utf8'));return data.name===name&&data.version===source.data.version;}catch{return false;}}
  if(await matches(destination))return;
  try{await fs.access(destination);destination=path.join(parentTarget,'node_modules',name);}catch{}
  if(await matches(destination))return;
  await fs.mkdir(path.dirname(destination),{recursive:true});
  await fs.cp(source.dir,destination,{recursive:true,dereference:true,errorOnExist:true,force:false,filter:(file)=>{
   if(file===source.dir)return true;
   const rel=path.relative(source.dir,file),parts=rel.split(path.sep),base=path.basename(file);
   if(parts.some(p=>p==='node_modules'||p==='test'||p==='tests'||p==='__tests__'||p==='.git'||p==='docs'||p==='example'||p==='examples')||base.startsWith('.env')||base==='.npmrc'||/\.(?:test|spec)\.[cm]?js$/.test(base))return false;
   if(/\.(?:node|exe|dll)$/i.test(base))throw Error('Native dependencies need a Linux ARM64 build');
   return true;
  }});
  packages.push({name,version:source.data.version});
  for(const dependency of Object.keys(source.data.dependencies||{}))await install(dependency,source.dir,destination);
  // Optional dependencies are intentionally not bundled: required runtime roots
  // are pure JS and must run without optional native integrations.
 }
 for(const name of roots)await install(name,root,target);
 return {packages,count:packages.length};
}
module.exports={vendorRuntimeDependencies};
