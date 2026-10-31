// Connections → External agents: this browser's room key, and the allowlist of agents it will talk to.
import {loadAgents,saveAgents,addAgent,checkAgent,roomIdentity} from './agents.js';
export function trustCommand(identity){return `./venv/bin/python -c "
import json, os
from pathlib import Path
from eureka_protocol.src.eureka_daemon.trust import TrustList
p = Path(os.environ['EUREKA_TRUST_PATH']).expanduser()
t = TrustList.load(p) if p.exists() else TrustList()
t.add('knights-circle-${identity.nodeId}', '${identity.publicKey}', ['room-turn'])
p.write_text(json.dumps(t.to_document(), indent=2) + '\\\\n'); p.chmod(0o600)
print('trusted knights-circle-${identity.nodeId} with room-turn')"`;}
export function mountAgents(){
  const $=s=>document.querySelector(s);let agents=loadAgents();const changed=()=>document.dispatchEvent(new Event('agents-changed'));
  // Collapsed by default; whether it's open is remembered per browser.
  const panel=$('#agents'),openKey='collaboration.agents-open.v1';
  try{panel.open=localStorage.getItem(openKey)==='1';}catch{}
  panel.addEventListener('toggle',()=>{try{if(panel.open)localStorage.setItem(openKey,'1');else localStorage.removeItem(openKey);}catch{}});
  const status=text=>{$('#agent-status').textContent=text;};
  function render(){$('#agent-count').textContent=String(agents.length);$('#agents-allowed').hidden=!agents.length;$('#agents-allowed').textContent=`${agents.length} allowed`;$('#agent-list').replaceChildren(...agents.map(a=>{const row=document.createElement('div');row.className='agent-row';const info=document.createElement('div');const name=document.createElement('strong');name.textContent=a.label;const meta=document.createElement('small');meta.textContent=`${a.url} · ${a.nodeId} · key ${a.publicKey.slice(0,12)}…`;info.append(name,meta);
    const check=document.createElement('button');check.type='button';check.textContent='Check';check.onclick=async()=>{check.disabled=true;status(`Checking ${a.label}…`);try{await checkAgent(a);status(`✓ ${a.label} answered at ${a.url} and proved it holds the pinned key (${a.nodeId}). It trusts this room’s key.`);}catch(e){status(`${a.label}: ${e.message}`);}finally{check.disabled=false;}};
    const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';remove.setAttribute('aria-label',`Remove ${a.label}`);remove.onclick=()=>{agents=agents.filter(x=>x.id!==a.id);try{saveAgents(agents);}catch{}status(`Removed ${a.label}. Rooms that include it can’t run its turns until it’s added again.`);render();changed();};
    row.append(info,check,remove);return row;}));}
  $('#agent-form').onsubmit=async e=>{e.preventDefault();try{agents=await addAgent(agents,{label:$('#agent-label').value,url:$('#agent-url').value,publicKey:$('#agent-key').value});saveAgents(agents);$('#agent-form').reset();status(`Added. Choose Check to confirm it answers, then add it to a room’s team.`);render();changed();}catch(err){status(err.message);}};
  $('#show-room-key').onclick=async()=>{try{const id=await roomIdentity();$('#room-key').value=id.publicKey;$('#room-node').textContent=`Node ${id.nodeId}. Non-extractable: ${id.extractable?'no':'yes'}.`;$('#trust-command').textContent=trustCommand(id);$('#room-key-box').hidden=false;$('#show-room-key').hidden=true;}catch(err){status(`Couldn’t create the room key: ${err.message}. This browser needs Ed25519 support and IndexedDB.`);}};
  $('#copy-trust').onclick=async()=>{try{await navigator.clipboard.writeText($('#trust-command').textContent);$('#copy-trust').textContent='Copied';setTimeout(()=>{$('#copy-trust').textContent='Copy command';},1500);}catch{$('#copy-trust').textContent='Select the text to copy';}};
  render();
}
