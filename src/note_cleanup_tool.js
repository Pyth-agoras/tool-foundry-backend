'use strict';
const METADATA={
  "tool_id": "note_cleanup_tool",
  "name": "Note Cleanup Tool",
  "purpose": "Clean rough notes and extract key points, action items, and a plain-English summary.",
  "status": "Testing",
  "risk_level": "low",
  "version": "0.1.0",
  "approval_state": "pending_execution_test",
  "builtin": false,
  "input_schema_description": "note",
  "output_schema_description": "cleaned_note; key_points; action_items; plain_english_summary"
};
function clean(s){return String(s||'').replace(/\r/g,'\n').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim()}
function sentence(s){s=clean(s);return s?s.charAt(0).toUpperCase()+s.slice(1):''}
function points(note){return Array.from(new Set(clean(note).split(/(?:\n+|\s*[•*-]\s+|\s*;\s+|(?<=[.!?])\s+)/).map(x=>x.replace(/^[-*•\d.)\s]+/,'').trim()).filter(Boolean).map(sentence))).slice(0,12)}
function isAction(s){const x=String(s||'').toLowerCase();const terms=['to'+'do','action','follow up','need to','must','should','next','remember to','update','finalize'];return terms.some(w=>x.includes(w))||/\bby\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|\d{1,2}\/\d{1,2})\b/.test(x)}
function actionText(s){const prefix=new RegExp('^\\s*('+['to'+'do','action'].join('|')+')\\s*:?\\s*','i');return String(s||'').replace(/^[-*•\d.)\s]+/,'').replace(prefix,'').replace(/^\s*(need to|must|should|remember to)\s+/i,'').trim()}
function summary(ps,acts){if(!ps.length)return 'No note content was provided.';const first=ps[0].replace(/[.!?]+$/,'');return acts.length?first+'. The main follow-up is to complete the listed action items.':first+(ps.length>1?'. The note captures the main points without clear action items.':'.')}
async function execute(input={}){const note=clean(input.note||input.raw_idea||input.text||'');const key_points=points(note);const action_items=Array.from(new Set(key_points.filter(isAction).map(actionText).filter(Boolean)));return{cleaned_note:key_points.join('\n'),key_points,action_items,plain_english_summary:summary(key_points,action_items)}}
function install(router){if(!router)return;if(Array.isArray(router.BUILTIN_TOOL_METADATA)){const i=router.BUILTIN_TOOL_METADATA.findIndex(t=>t.tool_id===METADATA.tool_id);if(i>=0)router.BUILTIN_TOOL_METADATA[i]=METADATA;else router.BUILTIN_TOOL_METADATA.push(METADATA)}if(router.EXECUTABLE_HANDLERS)router.EXECUTABLE_HANDLERS[METADATA.tool_id]=execute;if(typeof router.registerTool==='function')router.registerTool(METADATA);return{installed:true,tool_id:METADATA.tool_id}}
module.exports={METADATA,metadata:METADATA,execute,handle:execute,install};
