import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ollamaGuide,platforms,detectPlatform} from '../src/ollama-guide.js';
import {probeOllama,request} from '../src/providers.js';
const origin='https://knights-circle.example';
const commands=g=>g.steps.filter(s=>s.command).map(s=>s.command);
test('refused guide gives each platform the exact origin and restart steps',()=>{
  assert.deepEqual(commands(ollamaGuide('refused','mac-app',origin)),[`launchctl setenv OLLAMA_ORIGINS "${origin}"`]);
  assert.deepEqual(commands(ollamaGuide('refused','mac-brew',origin)),[`launchctl setenv OLLAMA_ORIGINS "${origin}"`,'brew services restart ollama']);
  assert.deepEqual(commands(ollamaGuide('refused','windows',origin)),[`setx OLLAMA_ORIGINS "${origin}"`]);
  assert.deepEqual(commands(ollamaGuide('refused','linux',origin)),['sudo systemctl edit ollama.service',`[Service]\nEnvironment="OLLAMA_ORIGINS=${origin}"`,'sudo systemctl daemon-reload && sudo systemctl restart ollama']);
  for(const [p] of platforms){const g=ollamaGuide('refused',p,origin);assert.ok(g.intro.includes(origin));assert.match(g.steps.at(-1).text,/Fetch models/);}
});
test('offline guide explains how to start Ollama on each platform',()=>{
  assert.deepEqual(commands(ollamaGuide('offline','mac-brew',origin)),['brew services start ollama']);
  assert.deepEqual(commands(ollamaGuide('offline','linux',origin)),['sudo systemctl start ollama']);
  assert.match(ollamaGuide('offline','windows',origin).steps[0].text,/Start menu/);
});
test('platform detection falls back to Mac',()=>{
  assert.equal(detectPlatform({userAgentData:{platform:'Windows'}}),'windows');assert.equal(detectPlatform({platform:'MacIntel'}),'mac-app');assert.equal(detectPlatform({platform:'Linux x86_64'}),'linux');assert.equal(detectPlatform(undefined),'mac-app');
});
test('probe tells a refusing server from a stopped one',async()=>{
  assert.equal(await probeOllama(async(url,init)=>{assert.equal(init.mode,'no-cors');assert.ok(url.endsWith('/api/version'));return new Response(null,{status:200});}),'refused');
  assert.equal(await probeOllama(async()=>{throw new TypeError('Failed to fetch');}),'offline');
});
test('HTTP errors carry their status, network errors do not',async()=>{
  await assert.rejects(request('https://api.openai.com',{},async()=>new Response('',{status:429})),e=>e.status===429);
  await assert.rejects(request('https://api.openai.com',{},async()=>{throw new TypeError('x');}),e=>e.status===undefined);
});
