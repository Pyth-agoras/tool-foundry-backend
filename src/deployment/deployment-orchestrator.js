'use strict';
const https=require('https');
const http=require('http');
const {redactError}=require('../ops/error-redactor');
async function triggerDeployment({hookUrl,commit,startedAt,serviceBaseUrl}){
  if(!hookUrl) throw new Error('deployment hook missing');
  return {status:'queued',hookUrl:redactError(hookUrl),commit,startedAt,serviceBaseUrl:redactError(serviceBaseUrl)};
}
module.exports={triggerDeployment};
