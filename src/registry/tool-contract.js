'use strict';
const {STATUSES}=require('../lifecycle/statuses');
function validateModule(mod, filename){
  const errors=[];
  if(!mod||typeof mod!=='object') errors.push('module export must be an object');
  for(const k of ['metadata','validateInput','execute','tests']) if(!mod||!(k in mod)) errors.push(`missing export: ${k}`);
  if(mod&&typeof mod.validateInput!=='function') errors.push('validateInput must be a function');
  if(mod&&typeof mod.execute!=='function') errors.push('execute must be a function');
  if(mod&&!Array.isArray(mod.tests)) errors.push('tests must be an array');
  const m=mod&&mod.metadata;
  for(const k of ['tool_id','name','version','purpose','lifecycle_status','risk_level','input_schema','output_schema','protected_effects']) if(!m||m[k]===undefined) errors.push(`metadata missing: ${k}`);
  if(m&&filename&&m.tool_id!==filename) errors.push('tool_id must match filename');
  if(m&&!STATUSES.includes(m.lifecycle_status)) errors.push('invalid lifecycle status');
  return errors;
}
module.exports={validateModule};
