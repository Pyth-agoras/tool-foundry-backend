'use strict';
const crypto = require('crypto');
function suppliedKey(headers={}) {
  const direct = String(headers['x-api-key'] || '');
  const auth = String(headers.authorization || '');
  return direct || (auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '');
}
function timingSafeEqualText(a,b){
  const x=Buffer.from(String(a)), y=Buffer.from(String(b));
  return x.length===y.length && x.length>0 && crypto.timingSafeEqual(x,y);
}
function authenticate(headers, configuredKey){
  if (!configuredKey) return {ok:false,status:503,error:'Authentication is not configured.'};
  return timingSafeEqualText(suppliedKey(headers), configuredKey)
    ? {ok:true}
    : {ok:false,status:401,error:'Unauthorized.'};
}
module.exports={authenticate,suppliedKey,timingSafeEqualText};
