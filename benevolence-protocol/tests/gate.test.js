'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {evaluate} = require('../gate');
const {server} = require('../server');

const baseline = () => ({
  request: 'Explain the result', answer: 'The result is still uncertain.',
  claims: [{text: 'The result is uncertain.', status: 'uncertain'}], actions: [],
  oversight: {restriction_triggered: false, response: 'not_applicable'},
  risk: {external_effect: false, authorization_ref: '', known_harmful: false, known_deception: false},
  benefit: {claimed: false, metric: '', observation_ref: ''}
});
test('well formed uncertainty reporting receives structural pass', () => {
  const result = evaluate(baseline());
  assert.equal(result.decision, 'structural_pass');
  assert.equal(result.assurance.execution_authorized_by_this_service, false);
});
test('known misrepresentation blocked', () => {
  const x = baseline(); x.risk.known_deception = true;
  assert.equal(evaluate(x).decision, 'block');
});
test('known harm blocked', () => {
  const x = baseline(); x.risk.known_harmful = true;
  assert.equal(evaluate(x).decision, 'block');
});
test('attempted oversight bypass blocked', () => {
  const x = baseline(); x.oversight = {restriction_triggered:true,response:'bypassed'};
  assert.equal(evaluate(x).decision, 'block');
});
test('restriction requires declared compliant handling', () => {
  const x = baseline(); x.oversight = {restriction_triggered:true,response:'not_applicable'};
  assert.equal(evaluate(x).decision, 'block');
});
test('respectful handling of restriction allowed', () => {
  const x = baseline(); x.oversight = {restriction_triggered:true,response:'explained'};
  assert.equal(evaluate(x).decision, 'structural_pass');
});
test('external effects without permission blocked', () => {
  const x = baseline(); x.risk.external_effect = true;
  assert.equal(evaluate(x).decision, 'block');
});
test('authorization reference is structurally accepted, not independently verified', () => {
  const x = baseline(); x.risk.external_effect = true; x.risk.authorization_ref = 'human-confirmation-123';
  const result = evaluate(x);
  assert.equal(result.decision, 'structural_pass');
  assert.equal(result.assurance.execution_authorized_by_this_service, false);
});
test('unsupported certainty requires revision', () => {
  const x = baseline(); x.claims = [{text:'All tests passed',status:'supported',evidence:[]}];
  assert.equal(evaluate(x).decision, 'revise');
});
test('traceable source can be listed without claiming independent verification', () => {
  const x = baseline(); x.claims = [{text:'tests passed', status:'supported', evidence:[{kind:'test',ref:'run-001',checked:'self_reported'}]}];
  const result = evaluate(x);
  assert.equal(result.decision, 'structural_pass');
  assert.ok(result.assurance.not_checked.includes('evidence authenticity'));
});
test('inference requires reasoning basis', () => {
  const x = baseline(); x.claims = [{text:'performance may improve',status:'inferred'}];
  assert.equal(evaluate(x).decision, 'revise');
});
test('claimed benefit requires a metric and observation', () => {
  const x = baseline(); x.benefit.claimed = true;
  assert.equal(evaluate(x).decision, 'revise');
  x.benefit.metric = 'seconds saved'; x.benefit.observation_ref = 'evaluation-4';
  assert.equal(evaluate(x).decision, 'structural_pass');
});
test('executed action without receipt requires revision', () => {
  const x = baseline(); x.actions = [{description:'ran the test', status:'executed'}];
  assert.equal(evaluate(x).decision, 'revise');
});
test('empty array can represent no actions', () => {
  const x = baseline(); x.actions = [];
  assert.equal(evaluate(x).decision, 'structural_pass');
});
test('bad input cannot crash evaluator', () => {
  assert.equal(evaluate(null).decision, 'block');
  assert.equal(evaluate([]).decision, 'block');
});
test('HTTP API serves policy and evaluates example', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const p = await fetch(`${base}/protocol`);
    assert.equal(p.status, 200);
    assert.equal((await p.json()).id, 'transparent-benefit-protocol');
    const rcl = await fetch(`${base}/rcl`);
    assert.equal(rcl.status, 200);
    assert.equal((await rcl.json()).model, 'transparent-benefit-protocol-v1');
    const res = await fetch(`${base}/evaluate`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(baseline())});
    assert.equal(res.status, 200);
    assert.equal((await res.json()).decision, 'structural_pass');
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/integration.txt`)).status, 200);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
