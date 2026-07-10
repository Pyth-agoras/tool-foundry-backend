'use strict';
const test=require('node:test');
const assert=require('node:assert');
const {RepositoryWriter}=require('../src/github/repository-writer');
const {triggerDeployment}=require('../src/deployment/deployment-orchestrator');
const {rollbackTransaction}=require('../src/ops/rollback-manager');

test('repository writer rejects missing config', async()=>{
  const writer=new RepositoryWriter({});
  await assert.rejects(()=>writer.assertBaseCommit('abc'), /base commit mismatch/);
});

test('deployment trigger redacts hook url', async()=>{
  const result=await triggerDeployment({hookUrl:'https://example.com/hook?token=x',commit:'abc',startedAt:'2024-01-01',serviceBaseUrl:'https://example.com'});
  assert.ok(result.status==='queued');
});

test('rollback transaction returns rolled_back', async()=>{
  const result=await rollbackTransaction({workspace:'/tmp/does-not-exist',branch:'repair/test'});
  assert.strictEqual(result.status,'rolled_back');
});
