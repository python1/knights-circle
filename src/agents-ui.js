// Connections → External agents: how to connect eureka-daemon, this browser's room key, and the allowlist of agents it will talk to.
import {loadAgents,saveAgents,addAgent,checkAgent,roomIdentity} from './agents.js';
// eureka-daemon's downloads. The visitor's computer may not be the agent's, so this only narrows the list, and
// only on what a browser reports reliably: a Mac's chip and a Linux browser's architecture often aren't.
export const DAEMON_FILES={mac:['eureka-daemon-aarch64-apple-darwin.tar.gz','eureka-daemon-x86_64-apple-darwin.tar.gz'],windows:['eureka-daemon-x86_64-pc-windows-msvc.zip'],linux:['eureka-daemon-x86_64-unknown-linux-musl.tar.gz','eureka-daemon-aarch64-unknown-linux-musl.tar.gz']};
export function daemonDownloads(nav=globalThis.navigator){
  const ua=String(nav?.userAgent||''),platform=String(nav?.userAgentData?.platform||nav?.platform||'');
  // Phones and tablets can't run it, and an iPad asking for the desktop site says it's a Mac.
  if(nav?.userAgentData?.mobile||/iPhone|iPad|iPod|Android/.test(ua)||(/mac/i.test(platform+ua)&&nav?.maxTouchPoints>1))return [];
  if(/win/i.test(platform)||/Windows NT/.test(ua))return DAEMON_FILES.windows;
  if(/mac/i.test(platform)||/Macintosh/.test(ua))return DAEMON_FILES.mac;
  if(/CrOS/.test(ua))return [];
  if(/linux/i.test(platform)||/Linux|X11/.test(ua)){
    if(/x86_64|amd64/i.test(platform+ua))return [DAEMON_FILES.linux[0]];
    if(/aarch64|arm64/i.test(platform+ua))return [DAEMON_FILES.linux[1]];
    return DAEMON_FILES.linux;}
  return [];
}
export function mountAgents(){
  const $=s=>document.querySelector(s);let agents=loadAgents();const changed=()=>document.dispatchEvent(new Event('agents-changed'));
  // Collapsed by default; whether it's open is remembered per browser.
  const toggle=$('#agents-toggle'),content=$('#agents-content'),openKey='collaboration.agents-open.v1';
  const show=open=>{toggle.setAttribute('aria-expanded',String(open));content.hidden=!open;};
  try{show(localStorage.getItem(openKey)==='1');}catch{}
  toggle.onclick=()=>{const open=content.hidden;show(open);try{if(open)localStorage.setItem(openKey,'1');else localStorage.removeItem(openKey);}catch{}};
  const status=text=>{$('#agent-status').textContent=text;};
  function render(){$('#agent-count').textContent=String(agents.length);$('#agents-allowed').hidden=!agents.length;$('#agents-allowed').textContent=`${agents.length} allowed`;$('#agent-list').replaceChildren(...agents.map(a=>{const row=document.createElement('div');row.className='agent-row';const info=document.createElement('div');const name=document.createElement('strong');name.textContent=a.label;const meta=document.createElement('small');meta.textContent=`${a.url} · ${a.nodeId} · key ${a.publicKey.slice(0,12)}…`;info.append(name,meta);
    const check=document.createElement('button');check.type='button';check.textContent='Check';check.onclick=async()=>{check.disabled=true;status(`Checking ${a.label}…`);try{await checkAgent(a);status(`✓ ${a.label} answered at ${a.url} and proved it holds the pinned key (${a.nodeId}). It trusts this room’s key.`);}catch(e){status(`${a.label}: ${e.message}`);}finally{check.disabled=false;}};
    const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';remove.setAttribute('aria-label',`Remove ${a.label}`);remove.onclick=()=>{agents=agents.filter(x=>x.id!==a.id);try{saveAgents(agents);}catch{}status(`Removed ${a.label}. Rooms that include it can’t run its turns until it’s added again.`);render();changed();};
    row.append(info,check,remove);return row;}));}
  $('#agent-form').onsubmit=async e=>{e.preventDefault();try{agents=await addAgent(agents,{label:$('#agent-label').value,url:$('#agent-url').value,publicKey:$('#agent-key').value});saveAgents(agents);$('#agent-form').reset();status(`Added. Choose Check to confirm it answers, then add it to a room’s team.`);render();changed();}catch(err){status(err.message);}};
  // Every download stays listed without scripts. With them, the list narrows to this computer's files when it can tell.
  const shown=daemonDownloads();
  if(shown.length){for(const item of document.querySelectorAll('#daemon-downloads li'))item.hidden=!shown.includes(item.dataset.file);
    const suggest=$('#daemon-suggest');suggest.textContent=shown.length===1?'For this computer:':'For this computer, one of:';suggest.hidden=false;}
  $('#show-room-key').onclick=async()=>{try{const id=await roomIdentity();$('#room-key').value=id.publicKey;$('#room-node').textContent=`Node ${id.nodeId}. Non-extractable: ${id.extractable?'no':'yes'}.`;$('#room-key-box').hidden=false;$('#show-room-key').hidden=true;}catch(err){status(`Couldn’t create the room key: ${err.message}. This browser needs Ed25519 support and IndexedDB.`);}};
  $('#copy-room-key').onclick=async()=>{const button=$('#copy-room-key');try{await navigator.clipboard.writeText($('#room-key').value);button.textContent='Copied';setTimeout(()=>{button.textContent='Copy key';},1500);}catch{$('#room-key').select();button.textContent='Selected: copy it with your keyboard';}};
  render();
}
