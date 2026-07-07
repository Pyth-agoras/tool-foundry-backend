else if(!valid){
  workflow_status='validation_required';
  next_required_tool='tool_installation_validator';
  next_required_action='Validate the proposed installation payload.';
}
else{
  workflow_status='ready_to_install';
  next_required_tool='foundry_operator';
  next_required_action='Install approved files and deploy.';
}
module.exports = {
  METADATA,
  execute,
  install
};
