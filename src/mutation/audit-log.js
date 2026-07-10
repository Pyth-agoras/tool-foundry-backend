'use strict';
class AuditLog{constructor(){this.events=[]}record(event){const e={timestamp:new Date().toISOString(),...event};this.events.push(e);return e}all(){return this.events.slice()}}
module.exports={AuditLog};
