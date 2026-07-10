'use strict';
const metadata={"tool_id":"registry_auditor","name":"Registry Auditor","version":"2.0.0","purpose":"Audit loaded tool modules and durable evidence.","lifecycle_status":"Approved","risk_level":"low","input_schema":{"type":"object","required":["registry"]},"output_schema":{"type":"object","required":["installed_tools","load_failures","duplicate_ids","safe_for_user_work"]},"protected_effects":[]};
function validateInput(input){return {ok:input&&typeof input==='object',errors:input&&typeof input==='object'?[]:['input must be an object']}}
async function execute(input={}){const r=input.registry||{};const installed=r.installed_tools||[];return{installed_tools:installed,load_failures:r.load_failures||[],duplicate_ids:r.duplicate_ids||[],safe_for_user_work:installed.filter(t=>t.lifecycle_status==='Approved'&&t.handler_state==='loaded'&&t.test_evidence!==false)}}
const tests=[{name:'metadata',run:()=>metadata.tool_id==='registry_auditor'}];
module.exports={metadata,validateInput,execute,tests};
