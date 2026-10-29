import {providers,listModels,generate} from './providers.js';
import {beginOAuth,finishOAuth} from './oauth.js';
const $=s=>document.querySelector(s),keys=new Map(),catalogs=new Map(),tested=new Set();
let selected=null,controller=null;
const dialog=$('#connection-dialog');
function render(){
  $('#count').textContent=String(catalogs.size);$('#providers').replaceChildren();
  for(const p of providers){const card=document.createElement('article');card.className='provider-card';
    const top=document.createElement('div');top.className='card-top';
    const icon=document.createElement('span');icon.className=`provider-icon ${p.id}`;icon.textContent=p.initial;
    const badge=document.createElement('span');badge.className='connection-state';badge.textContent=tested.has(p.id)?'Test passed':catalogs.has(p.id)?'Models fetched':'Not connected';
    top.append(icon,badge);const title=document.createElement('h3');title.textContent=p.name;
    const description=document.createElement('p');description.textContent=p.description;
    const button=document.createElement('button');button.className='connect-button';button.textContent=catalogs.has(p.id)?'Manage connection ↗':'Connect provider +';button.setAttribute('aria-label',`${catalogs.has(p.id)?'Manage':'Connect'} ${p.name}`);button.onclick=()=>open(p.id);
    card.append(top,title,description,button);$('#providers').append(card);
  }
}
function populate(){const select=$('#model');select.replaceChildren();for(const model of catalogs.get(selected)||[]){const option=document.createElement('option');option.value=model.id;option.textContent=model.id;select.append(option);}$('#test-panel').hidden=!select.options.length;}
function open(id){selected=id;$('#dialog-title').textContent=providers.find(p=>p.id===id).name;$('#api-key').value='';$('#api-key').placeholder=keys.has(id)?'Key held in memory; paste to replace':'Paste your own API key';$('#api-key').hidden=$('#key-label').hidden=id==='ollama';$('#local-help').hidden=id!=='ollama';$('#oauth').hidden=id!=='openrouter';$('#connection-status').textContent='';$('#test-output').textContent='';$('#usage').textContent='';populate();dialog.showModal();}
function busy(value){$('#verify').disabled=value;$('#run-test').disabled=value;$('#oauth').disabled=value;$('#disconnect').disabled=value;$('#api-key').disabled=value;$('#model').disabled=value;$('#stop-test').disabled=!value;}
function stop(){controller?.abort();}
dialog.addEventListener('close',()=>{stop();$('#api-key').value='';});$('#close-dialog').onclick=()=>dialog.close();$('#stop-test').onclick=stop;
$('#disconnect').onclick=()=>{keys.delete(selected);catalogs.delete(selected);tested.delete(selected);$('#api-key').value='';populate();render();$('#connection-status').textContent='Disconnected. The key has been removed from app memory.';};
$('#oauth').onclick=()=>beginOAuth().catch(()=>{$('#connection-status').textContent='Unable to start sign-in. Check browser storage permissions.';});
$('#connect-form').onsubmit=async event=>{event.preventDefault();if(controller)return;const id=selected,key=$('#api-key').value.trim()||keys.get(id);$('#api-key').value='';controller=new AbortController();busy(true);$('#connection-status').textContent='Fetching available models…';try{const models=await listModels(id,key,AbortSignal.any([controller.signal,AbortSignal.timeout(30000)]));if(id!=='ollama')keys.set(id,key);catalogs.set(id,models);tested.delete(id);populate();render();$('#connection-status').textContent=`${models.length} models found. Run a test to verify inference.`;}catch(e){$('#connection-status').textContent=e.name==='AbortError'?'Connection check stopped.':e.name==='TimeoutError'?'Connection check timed out.':e.message;}finally{controller=null;busy(false);}};
$('#run-test').onclick=async()=>{if(controller)return;const prompt=$('#prompt').value.trim();if(!prompt){$('#connection-status').textContent='Enter a test prompt.';return;}controller=new AbortController();busy(true);$('#test-output').textContent='';$('#usage').textContent='';$('#connection-status').textContent='Waiting for the provider…';let received=false;try{for await(const event of generate({provider:selected,key:keys.get(selected),model:$('#model').value,messages:[{role:'user',content:prompt}],signal:AbortSignal.any([controller.signal,AbortSignal.timeout(120000)])})){if(event.text){received=true;$('#test-output').textContent+=event.text;}if(event.usage)$('#usage').textContent='Provider-reported usage: '+JSON.stringify(event.usage);}if(!received)throw new Error('No text returned. The model may require different settings or a larger output limit.');tested.add(selected);render();$('#connection-status').textContent='Streaming test completed.';}catch(e){$('#connection-status').textContent=e.name==='AbortError'?'Stopped. The provider may still charge for work already performed.':e.name==='TimeoutError'?'Provider timed out. Partial usage may still be billed.':e.message;}finally{controller=null;busy(false);}};
render();
finishOAuth().then(key=>{if(key){keys.set('openrouter',key);open('openrouter');$('#connection-status').textContent='Sign-in complete. Fetch models to verify access.';}}).catch(e=>{$('#global-status').textContent=e.message;});
