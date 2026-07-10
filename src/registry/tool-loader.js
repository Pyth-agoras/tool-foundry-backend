'use strict';
const fs=require('fs'), path=require('path');
const {validateModule}=require('./tool-contract');
function loadTools(dir=path.join(__dirname,'..','tools')){
  const tools=new Map(), failures=[], duplicates=[];
  for(const file of fs.readdirSync(dir).filter(x=>x.endsWith('.js')).sort()){
    const id=path.basename(file,'.js');
    try{
      delete require.cache[require.resolve(path.join(dir,file))];
      const mod=require(path.join(dir,file));
      const errors=validateModule(mod,id);
      if(errors.length){failures.push({tool_id:id,path:path.join(dir,file),errors});continue}
      if(tools.has(mod.metadata.tool_id)){duplicates.push(mod.metadata.tool_id);continue}
      tools.set(mod.metadata.tool_id,{...mod,source_path:path.join(dir,file),load_result:'loaded'});
    }catch(error){failures.push({tool_id:id,path:path.join(dir,file),errors:[error.message]})}
  }
  return {tools,failures,duplicates};
}
module.exports={loadTools};
