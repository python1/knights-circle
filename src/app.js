import {showShared} from './export.js';
import {mountRooms} from './room-ui.js';
import {mountAgents} from './agents-ui.js';
import {loadAgents} from './agents.js';
import {providers,listModels,generate,probeOllama,modelLabel,pickDefault} from './providers.js';
import {ollamaGuide,platforms,detectPlatform,detectBrowser,localNetworkPermission} from './ollama-guide.js';
import {renderMarkdown} from './markdown.js';
import {openModal} from './dialog.js';
import {count as plural} from './format.js';
import {beginOAuth,finishOAuth} from './oauth.js';
const $=s=>document.querySelector(s),keys=new Map(),catalogs=new Map(),tested=new Set(),working=new Map();
let selected=null,controller=null,guideProblem=null;
const dialog=$('#connection-dialog');
// Only non-secret state survives a reload (e.g. the OpenRouter sign-in redirect): whether Ollama was connected. API keys stay in memory.
const connectionsKey='collaboration.connections.v1';
function rememberOllama(on){try{if(on)localStorage.setItem(connectionsKey,JSON.stringify({ollama:true}));else localStorage.removeItem(connectionsKey);}catch{}}
// Models that passed a test, so the default pick survives a reload too (model IDs only).
const workingKey='collaboration.working-models.v1';
try{for(const [provider,model] of Object.entries(JSON.parse(localStorage.getItem(workingKey))||{}))if(typeof model==='string')working.set(provider,model);}catch{}
function rememberWorking(provider,model){working.set(provider,model);try{localStorage.setItem(workingKey,JSON.stringify(Object.fromEntries(working)));}catch{}}
function ollamaRemembered(){try{return JSON.parse(localStorage.getItem(connectionsKey))?.ollama===true;}catch{return false;}}
// Sidebar status: only what this tab actually knows (connected catalogs, the agent allowlist, the room's memory pack).
let memoryState={state:'off'};
function renderStatus(){
  const rows=[...catalogs].map(([id,models])=>['ok',`${providers.find(p=>p.id===id)?.name||id}${id==='ollama'?' · local':''} · ${models.length} model${models.length===1?'':'s'}`]);
  if(!rows.length)rows.push(['off','No providers connected']);
  const agents=loadAgents().length;if(agents)rows.push(['agent',`${agents} external agent${agents===1?'':'s'} allowlisted`]);
  rows.push(memoryState.state==='on'?['memory',`Verified memory · on · ${plural(memoryState.records,'record')}`]:memoryState.state==='missing'?['warn','Verified memory · needs its pack']:['off','Verified memory · off']);
  $('#side-status').replaceChildren(...rows.map(([kind,text])=>{const li=document.createElement('li');li.className=`status-${kind}`;li.textContent=text;return li;}));
}
document.addEventListener('agents-changed',renderStatus);
document.addEventListener('vm-changed',e=>{memoryState=e.detail;renderStatus();});
function render(){
  renderStatus();
  $('#count').textContent=String(catalogs.size);$('#count-help').textContent=catalogs.size?`${catalogs.size} provider${catalogs.size===1?'':'s'} connected`:'No providers connected yet';$('#count').setAttribute('aria-label',$('#count-help').textContent);$('#providers').replaceChildren();
  for(const p of providers){const card=document.createElement('article'),connected=catalogs.has(p.id),count=catalogs.get(p.id)?.length||0;card.className=connected?'provider-card is-connected':'provider-card';
    const top=document.createElement('div');top.className='card-top';
    const icon=document.createElement('span');icon.className=`provider-icon ${p.id}`;icon.textContent=p.initial;
    const badge=document.createElement('span');badge.className=connected?'connection-state connected':'connection-state';badge.textContent=connected?`Connected · ${tested.has(p.id)?'test passed':`${count} model${count===1?'':'s'}`}`:'Not connected';
    top.append(icon,badge);const title=document.createElement('h3');title.textContent=p.name;
    const description=document.createElement('p');description.textContent=p.description;
    const button=document.createElement('button');button.className=catalogs.has(p.id)?'connect-button':'connect-button primary';button.textContent=catalogs.has(p.id)?'Manage connection ↗':'Connect provider +';button.setAttribute('aria-label',`${catalogs.has(p.id)?'Manage':'Connect'} ${p.name}`);button.onclick=()=>open(p.id);
    card.append(top,title,description,button);$('#providers').append(card);
  }
}
function populate(){const select=$('#model'),all=catalogs.get(selected)||[],models=$('#free-only').checked?all.filter(m=>m.free):all;select.replaceChildren(...models.map(m=>new Option(modelLabel(m),m.id)));const pick=pickDefault(models,[working.get(selected)]);if(pick)select.value=pick.id;$('#test-panel').hidden=!all.length;$('#model-note').hidden=!all.length||models.length>0;}
$('#free-only').onchange=populate;
function showGuide(problem){guideProblem=problem;$('#ollama-guide').hidden=!problem;if(!problem)return;const select=$('#guide-platform');if(!select.options.length){for(const [value,label] of platforms)select.append(new Option(label,value));select.value=detectPlatform();}
  const guide=ollamaGuide(problem,select.value,location.origin,browser);select.hidden=$('label[for=guide-platform]').hidden=!!guide.platformless;$('#guide-title').textContent=guide.title;$('#guide-intro').textContent=guide.intro;$('#guide-steps').replaceChildren(...guide.steps.map(step=>{const li=document.createElement('li');li.append(step.text);if(step.link){const a=document.createElement('a');a.href=step.link.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=step.link.label;li.append(' ',a);}if(step.command){const row=document.createElement('div');row.className='guide-command';const pre=document.createElement('pre');pre.textContent=step.command;const copy=document.createElement('button');copy.type='button';copy.textContent='Copy';copy.setAttribute('aria-label',`Copy: ${step.command}`);copy.onclick=()=>navigator.clipboard?.writeText(step.command).then(()=>{copy.textContent='Copied';},()=>{copy.textContent='Copy failed';});row.append(pre,copy);li.append(row);}return li;}));$('#guide-notes').replaceChildren(...guide.notes.map(note=>{const li=document.createElement('li');li.textContent=note;return li;}));}
$('#guide-platform').onchange=()=>showGuide(guideProblem);
// A blocked request and a stopped server look the same to the page, so check the browser's own rules before probing.
const browser=detectBrowser();
async function diagnoseOllama(){if(browser==='safari'&&location.protocol==='https:')return 'safari';if(browser==='chromium'&&await localNetworkPermission()==='denied')return 'blocked';return probeOllama();}
function keyLink(){const p=providers.find(p=>p.id===selected);$('#key-link').hidden=!p?.keyUrl||keys.has(selected)||!!$('#api-key').value;if(p?.keyUrl){$('#key-url').href=p.keyUrl;$('#key-url').textContent=`Get an API key from ${p.name}`;}}
function connectedState(){$('#disconnect').disabled=!!controller||!(keys.has(selected)||catalogs.has(selected));}
$('#api-key').oninput=keyLink;
function limit(){$('#run-test').textContent=`Send test · up to ${$('#max-tokens').value||0} output tokens`;}
// Errors in the connection panel read as errors, not in the success colour.
const tone=(error=false)=>$('#connection-status').classList.toggle('is-error',error);
function open(id){if(controller)return;selected=id;$('#dialog-title').textContent=providers.find(p=>p.id===id).name;$('#api-key').value='';$('#api-key').placeholder=keys.has(id)?'Key held in memory; paste to replace':'Paste your own API key';$('#api-key').hidden=$('#key-label').hidden=id==='ollama';$('#local-help').hidden=id!=='ollama';showGuide(null);$('#oauth').hidden=$('#oauth-note').hidden=id!=='openrouter';tone();$('#connection-status').textContent='';$('#test-output').textContent='';$('#reasoning-output').textContent='';$('#test-reasoning').hidden=true;$('#test-reasoning').open=false;$('#usage').textContent='';$('#charges-note').hidden=$('#key-note').hidden=id==='ollama';$('#local-note').hidden=id!=='ollama';keyLink();connectedState();$('#max-tokens').value=id==='ollama'?2048:256;limit();populate();openModal(dialog,{cancelValue:'',fallback:()=>$('#providers button')});}
function busy(value){$('#verify').disabled=value;$('#run-test').disabled=value;$('#oauth').disabled=value;connectedState();$('#api-key').disabled=value;$('#model').disabled=value;$('#free-only').disabled=value;$('#max-tokens').disabled=value;$('#stop-test').disabled=!value;}
function stop(){controller?.abort();}
$('#max-tokens').oninput=limit;
dialog.addEventListener('close',()=>{stop();$('#api-key').value='';});$('#close-dialog').onclick=()=>dialog.close();$('#stop-test').onclick=stop;
$('#disconnect').onclick=()=>{tone();if(selected==='ollama')rememberOllama(false);keys.delete(selected);catalogs.delete(selected);tested.delete(selected);$('#api-key').value='';populate();render();keyLink();connectedState();$('#connection-status').textContent=selected==='ollama'?'Disconnected from Ollama.':'Disconnected. The key has been removed from app memory.';};
$('#oauth').onclick=()=>beginOAuth().catch(()=>{tone(true);$('#connection-status').textContent='Unable to start sign-in. Check browser storage permissions.';});
$('#connect-form').onsubmit=async event=>{event.preventDefault();if(controller)return;const id=selected,key=$('#api-key').value.trim()||keys.get(id);$('#api-key').value='';controller=new AbortController();busy(true);tone();$('#connection-status').textContent='Fetching available models…';showGuide(null);try{const models=await listModels(id,key,AbortSignal.any([controller.signal,AbortSignal.timeout(30000)]));if(id!=='ollama')keys.set(id,key);else rememberOllama(true);catalogs.set(id,models);tested.delete(id);populate();render();$('#connection-status').textContent=id==='ollama'&&!models.length?'Ollama is running but has no models yet. In a terminal, run: ollama pull qwen3.5:4b — then choose Fetch models again.':`${plural(models.length,'model')} found. Run a test to verify inference.`;}catch(e){tone(e.name!=='AbortError');$('#connection-status').textContent=e.name==='AbortError'?'Connection check stopped.':e.name==='TimeoutError'?'Connection check timed out.':e.message;if(id==='ollama'&&e.name!=='AbortError'&&!e.status){const problem=await diagnoseOllama();if(selected==='ollama'){showGuide(problem);$('#connection-status').textContent={refused:'Ollama is running but refused this site. Follow the steps above.',safari:'Safari blocks this site from reaching Ollama. Follow the steps above.',blocked:'Your browser blocked this site from reaching Ollama. Follow the steps above.'}[problem]||'Ollama isn’t reachable. Follow the steps above.';}}}finally{controller=null;busy(false);keyLink();}};
$('#run-test').onclick=async()=>{if(controller)return;const prompt=$('#prompt').value.trim();tone();if(!prompt){tone(true);$('#connection-status').textContent='Enter a test prompt.';return;}const maxTokens=Number($('#max-tokens').value);if(!Number.isInteger(maxTokens)||maxTokens<1||maxTokens>32768){tone(true);$('#connection-status').textContent='Output limit must be a whole number from 1 to 32,768.';return;}controller=new AbortController();busy(true);$('#test-output').textContent='';$('#reasoning-output').textContent='';$('#test-reasoning').hidden=true;$('#test-reasoning').open=false;$('#usage').textContent='';$('#connection-status').textContent='Waiting for the provider…';let received=false,reasoned=false,answer='';try{for await(const event of generate({provider:selected,key:keys.get(selected),model:$('#model').value,messages:[{role:'user',content:prompt}],maxTokens,info:catalogs.get(selected)?.find(m=>m.id===$('#model').value),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(120000)])})){if(event.reasoning){reasoned=true;$('#test-reasoning').hidden=false;$('#reasoning-output').textContent+=event.reasoning;}if(event.text){received=true;answer+=event.text;renderMarkdown($('#test-output'),answer);}if(event.usage)$('#usage').textContent='Provider-reported usage: '+JSON.stringify(event.usage);}if(!received)throw new Error(reasoned?'The model spent its output limit on reasoning before answering. Raise the output limit and try again.':'The model returned no text. Try again, raise the output limit, or pick another model.');tested.add(selected);rememberWorking(selected,$('#model').value);render();$('#connection-status').textContent='Streaming test completed.';}catch(e){tone(e.name!=='AbortError');$('#connection-status').textContent=e.name==='AbortError'?'Stopped. The provider may still charge for work already performed.':e.name==='TimeoutError'?'Provider timed out. Partial usage may still be billed.':e.message;}finally{controller=null;busy(false);}};
render();
if(ollamaRemembered())listModels('ollama',undefined,AbortSignal.timeout(10000)).then(models=>{if(catalogs.has('ollama'))return;catalogs.set('ollama',models);render();if(selected==='ollama'&&dialog.open)populate();document.dispatchEvent(new Event('catalogs-changed'));}).catch(()=>{});
(location.hash.startsWith('#share=')?Promise.resolve(null):finishOAuth()).then(key=>{if(key){keys.set('openrouter',key);open('openrouter');$('#connection-status').textContent='Sign-in complete. Fetch models to verify access.';}}).catch(e=>{$('#global-status').textContent=e.message;});

if(!showShared()){mountAgents();mountRooms({catalogs,working,keyFor:id=>keys.get(id),generate:args=>generate({...args,info:catalogs.get(args.provider)?.find(m=>m.id===args.model)})});}
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{$('#global-status')&&($('#global-status').textContent='Offline setup unavailable. The workspace still works online.');});
