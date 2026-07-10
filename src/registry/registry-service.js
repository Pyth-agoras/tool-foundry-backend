'use strict';
const {loadTools}=require('./tool-loader');
class RegistryService{
  constructor(dir){this.dir=dir;this.reload()}
  reload(){const r=loadTools(this.dir);this.tools=r.tools;this.failures=r.failures;this.duplicates=r.duplicates;return this.snapshot()}
  snapshot(){return{installed_tools:[...this.tools.values()].map(t=>({tool_id:t.metadata.tool_id,version:t.metadata.version,lifecycle_status:t.metadata.lifecycle_status,handler_state:'loaded',source_path:t.source_path})),load_failures:this.failures,duplicate_ids:this.duplicates}}
  get(id){return this.tools.get(id)}
}
module.exports={RegistryService};
