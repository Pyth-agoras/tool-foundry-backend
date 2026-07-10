'use strict';
const fs=require('fs');
const path=require('path');
function writeDeploymentMarker(baseDir, marker){
  const target=path.join(baseDir, 'deployment-marker.json');
  fs.mkdirSync(baseDir,{recursive:true});
  fs.writeFileSync(target, JSON.stringify(marker,null,2));
  return target;
}
function readDeploymentMarker(baseDir){
  const target=path.join(baseDir, 'deployment-marker.json');
  if(!fs.existsSync(target)) return null;
  return JSON.parse(fs.readFileSync(target,'utf8'));
}
module.exports={writeDeploymentMarker,readDeploymentMarker};
