import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ollamaGuide,platforms,detectPlatform,detectBrowser,localNetworkPermission} from '../src/ollama-guide.js';
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
test('offline guide covers install, allowing this site, starting Ollama, and pulling a model',()=>{
  assert.deepEqual(commands(ollamaGuide('offline','mac-app',origin)),[`launchctl setenv OLLAMA_ORIGINS "${origin}"`,'ollama pull qwen3.5:4b']);
  assert.deepEqual(commands(ollamaGuide('offline','mac-brew',origin)),[`launchctl setenv OLLAMA_ORIGINS "${origin}"`,'brew services start ollama','ollama pull qwen3.5:4b']);
  assert.deepEqual(commands(ollamaGuide('offline','windows',origin)),[`setx OLLAMA_ORIGINS "${origin}"`,'ollama pull qwen3.5:4b']);
  assert.deepEqual(commands(ollamaGuide('offline','linux',origin)),['sudo systemctl edit ollama.service',`[Service]\nEnvironment="OLLAMA_ORIGINS=${origin}"`,'sudo systemctl daemon-reload','sudo systemctl start ollama','ollama pull qwen3.5:4b']);
  const win=ollamaGuide('offline','windows',origin).steps,setx=win.findIndex(s=>/setx/.test(s.command));
  assert.match(win[setx+1].text,/quit it.*Start menu/,'Windows restarts Ollama after setx so it picks up the setting');
  for(const [p] of platforms){const g=ollamaGuide('offline',p,origin);assert.equal(g.steps[0].link.href,'https://ollama.com/download');assert.match(g.steps.at(-1).text,/Fetch models/);assert.ok(g.notes[0].includes(origin));assert.doesNotMatch(JSON.stringify(g),/\bkey\b|credential/i);}
});
test('platform detection falls back to Mac',()=>{
  assert.equal(detectPlatform({userAgentData:{platform:'Windows'}}),'windows');assert.equal(detectPlatform({platform:'MacIntel'}),'mac-app');assert.equal(detectPlatform({platform:'Linux x86_64'}),'linux');assert.equal(detectPlatform({}),'mac-app');
});
test('browser engine is detected from the user agent, with every iOS browser counted as WebKit',()=>{
  const ua=userAgent=>({userAgent});
  assert.equal(detectBrowser(ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3.1 Safari/605.1.15')),'safari');
  assert.equal(detectBrowser(ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36')),'chromium');
  assert.equal(detectBrowser(ua('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36 Edg/156.0.0.0')),'chromium');
  assert.equal(detectBrowser({userAgent:'',userAgentData:{brands:[{brand:'Chromium'}]}}),'chromium');
  assert.equal(detectBrowser(ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 15.7; rv:150.0) Gecko/20100101 Firefox/150.0')),'firefox');
  assert.equal(detectBrowser(ua('Mozilla/5.0 (iPhone; CPU iPhone OS 26_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/156.0 Mobile/15E148 Safari/604.1')),'safari');
  assert.equal(detectBrowser(ua('Mozilla/5.0 (iPad; CPU OS 26_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/150.0 Mobile/15E148 Safari/605.1.15')),'safari');
  assert.equal(detectBrowser({}),'other');
});
test('local network permission reads the loopback permission first and copes with browsers that lack it',async()=>{
  const asked=[];const nav=states=>({permissions:{query:async({name})=>{asked.push(name);if(!(name in states))throw new TypeError('unknown permission');return {state:states[name]};}}});
  assert.equal(await localNetworkPermission(nav({'loopback-network':'denied','local-network-access':'granted'})),'denied');
  assert.equal(await localNetworkPermission(nav({'local-network-access':'prompt'})),'prompt');
  assert.equal(await localNetworkPermission(nav({})),null);assert.equal(await localNetworkPermission({}),null);
});
test('Safari and blocked-permission guides say the browser stopped the request, not that Ollama is off',()=>{
  const origin='https://knights-circle.vercel.app';
  const safari=ollamaGuide('safari','mac-app',origin,'safari');
  assert.ok(safari.platformless);assert.match(safari.title,/Safari/);assert.match(safari.intro,/may be running/);assert.deepEqual(commands(safari),[origin]);assert.match(safari.steps[0].text,/Chrome, Edge or Firefox/);assert.match(safari.steps.at(-1).text,/Fetch models/);
  assert.ok(safari.notes.some(n=>/iPhone or iPad/.test(n)));
  const blocked=ollamaGuide('blocked','mac-app',origin,'chromium');
  assert.ok(blocked.platformless);assert.match(blocked.steps.map(s=>s.text).join(' '),/site settings.*Allow/);assert.match(blocked.notes[0],/OLLAMA_ORIGINS/);
  for(const problem of ['offline','refused']){
    assert.ok(ollamaGuide(problem,'mac-app',origin,'chromium').steps.some(s=>/local network, choose Allow/.test(s.text)));
    assert.ok(!ollamaGuide(problem,'mac-app',origin,'firefox').steps.some(s=>/local network/.test(s.text)));
    assert.match(ollamaGuide(problem,'mac-app',origin,'chromium').steps.at(-1).text,/Fetch models/);
  }
  const steps=ollamaGuide('offline','mac-app',origin,'chromium').steps;
  assert.ok(steps.findIndex(s=>/local network/.test(s.text))<steps.findIndex(s=>/ollama pull/.test(s.command)),'allow local network access comes before pulling a model');
});
test('probe tells a refusing server from a stopped one',async()=>{
  assert.equal(await probeOllama(async(url,init)=>{assert.equal(init.mode,'no-cors');assert.ok(url.endsWith('/api/version'));return new Response(null,{status:200});}),'refused');
  assert.equal(await probeOllama(async()=>{throw new TypeError('Failed to fetch');}),'offline');
});
test('HTTP errors carry their status, network errors do not',async()=>{
  await assert.rejects(request('https://api.openai.com',{},async()=>new Response('',{status:429})),e=>e.status===429);
  await assert.rejects(request('https://api.openai.com',{},async()=>{throw new TypeError('x');}),e=>e.status===undefined);
});
