'use strict';
function canExecute(metadata){return metadata && metadata.lifecycle_status==='Approved';}
module.exports={canExecute};
