'use strict';
const REDACTED='[REDACTED]';
const SECRET_KEYS=/token|secret|key|authorization|hook|password/i;
function redactValue(value){
  if(typeof value!=='string') return value;
  return value.replace(/(https?:\/\/[^:@/\s]+)(:[^@/\s]+)?@/gi, '$1@[REDACTED]@').replace(/(Bearer\s+)[^\s]+/gi, '$1[REDACTED]');
}
function redactError(value){
  if(typeof value!=='string') return value;
  return value.split(/\n/).map(line=>line.replace(/(github_pat_[A-Za-z0-9_]+)/g, '[REDACTED]').replace(/(ghp_[A-Za-z0-9]+)/g, '[REDACTED]').replace(/(api[_-]?key|token|secret|password|authorization|hook|x-api-key)/gi, (m)=>m.toLowerCase()==='authorization'?'[REDACTED]':m)).join('\n');
}
module.exports={redactError,redactValue};
