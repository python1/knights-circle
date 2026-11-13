// External agents (Eureka): the allowlist the person controls, the grants each room member gets, and what one turn
// sends. Agents are untrusted: they receive only what their grants allow, their replies are labelled and checked like
// any model's, and nothing here can approve or sign memory.
import {EurekaPeer,createIdentity,validKey,nodeIdOf,EurekaError,ROOM_TURN} from './eureka-client.js';
import {detectBrowser,localNetworkPermission} from './ollama-guide.js';

export const agentsKey='collaboration.agents.v1';
// What the agent's room-turn handler accepts (eureka_protocol room_turn.py), with room for the request envelope.
export const TURN_LIMITS={messages:200,chars:48000};
export const transcriptGrants=[['objective','Objective only'],['last1','Objective and the latest message'],['last4','Objective and the last 4 messages'],['all','The full transcript']];
// Minimum by default: enough to answer the latest message, nothing from Verified Memory, no memory proposals.
export const defaultGrants=()=>({transcript:'last1',memory:false,propose:false});
/**
 * The grants one turn uses. A plan needs the whole discussion, so a Lead whose transcript the owner left at the default
 * sees the full transcript while a seat in the room runs plans. Once the owner picks a transcript (transcriptSet), that
 * choice is used as it is.
 */
export function turnGrants(member,{planSeat=false}={}){
  const g=member.grants||defaultGrants();
  return member.role==='Lead'&&planSeat&&!g.transcriptSet?{...g,transcript:'all'}:g;
}

const ADDRESS=/^http:\/\/127\.0\.0\.1:(\d{1,5})$/;
/** An allowlist entry, checked: a label, a loopback address the page's CSP allows, and the agent's pinned key. */
export function validateAgent({label,url,publicKey}){
  const l=String(label||'').trim(),u=String(url||'').trim().replace(/\/+$/,''),k=String(publicKey||'').trim().toLowerCase(),port=Number(u.match(ADDRESS)?.[1]);
  if(!l||l.length>40)throw new Error('Give the agent a name of up to 40 characters.');
  if(!port||port>65535)throw new Error('Address must be http://127.0.0.1:PORT, an agent on this computer.');
  if(!validKey(k))throw new Error('The agent’s public key is 64 hexadecimal characters (its daemon prints it at startup as “public key”).');
  return {label:l,url:u,publicKey:k};
}
export function loadAgents(storage=globalThis.localStorage){try{const list=JSON.parse(storage.getItem(agentsKey));return Array.isArray(list)?list.filter(a=>a&&typeof a.id==='string'&&validKey(a.publicKey)&&ADDRESS.test(a.url)):[];}catch{return [];}}
export function saveAgents(list,storage=globalThis.localStorage){storage.setItem(agentsKey,JSON.stringify(list.map(({id,label,url,publicKey,nodeId})=>({id,label,url,publicKey,nodeId}))));}
export async function addAgent(list,fields){const agent=validateAgent(fields);if(list.some(a=>a.publicKey===agent.publicKey))throw new Error('That key is already in your allowlist.');return [...list,{id:crypto.randomUUID(),...agent,nodeId:await nodeIdOf(agent.publicKey)}];}

const transcriptCount={objective:0,last1:1,last4:4};
/**
 * One turn's payload for the agent: the room's system prompt (with memory sections only if granted, already applied
 * by the caller), the objective, and the granted slice of the transcript, trimmed oldest first to the agent's caps.
 * Returns the payload and an honest summary of what was sent, shown with the reply.
 */
export function buildTurn({system,messages,grants=defaultGrants()}){
  const [objective,...transcript]=messages,keep=grants.transcript==='all'?transcript.length:transcriptCount[grants.transcript]??1;
  let shown=keep?transcript.slice(-keep):[];
  const size=list=>system.length+(objective?.content.length||0)+list.reduce((n,m)=>n+m.content.length,0);
  while(shown.length&&(size(shown)>TURN_LIMITS.chars||shown.length+2>TURN_LIMITS.messages))shown=shown.slice(1);
  if(size(shown)>TURN_LIMITS.chars)throw new Error('The room’s instructions and objective alone are longer than an agent turn allows (48,000 characters). Shorten them.');
  const payload={messages:[{role:'system',content:system},...(objective?[objective]:[]),...shown].map(({role,content})=>({role,content}))};
  return {payload,sent:{messages:shown.length,of:transcript.length,trimmed:shown.length<Math.min(keep,transcript.length),memory:!!grants.memory,propose:!!grants.propose,chars:size(shown)}};
}
export function describeSent(sent,to){const what=sent.messages===sent.of&&sent.of?sent.of===1?'the objective and the one message so far':`the objective and all ${sent.of} messages`:sent.messages?`the objective and the last ${sent.messages} of ${sent.of} message${sent.of===1?'':'s'}`:'the objective only';return `Sent to ${to}: room instructions, ${what}${sent.trimmed?' (trimmed to fit)':''}, ${sent.memory?'Verified Memory records':'no Verified Memory'}, ${sent.propose?'may propose memory':'no memory proposals'}.`;}
export function describeGrants(g){return `${transcriptGrants.find(([v])=>v===g.transcript)?.[1]||'Objective and the latest message'} · ${g.memory?'memory records':'no memory'} · ${g.propose?'may propose':'no proposals'}`;}

/** Why a request to an agent on this computer didn't get through, in words the person can act on. */
export async function explainUnreachable(agent,{nav=globalThis.navigator,origin=globalThis.location?.origin,protocol=globalThis.location?.protocol}={}){
  const browser=detectBrowser(nav);
  if(browser==='safari'&&protocol==='https:')return 'Safari blocks this site from reaching agents on your computer over plain http. Open this page in Chrome, Edge or Firefox to use local agents.';
  if(browser==='chromium'){const state=await localNetworkPermission(nav);if(state==='denied')return 'Your browser blocked this site from reaching apps on this computer. Click the site settings icon left of the address bar, allow local network access, then reload.';if(state==='prompt')return 'Your browser is asking whether this site may reach apps on this computer. Choose Allow, then try again.';}
  return `Couldn’t reach the agent at ${agent.url}. Check its daemon is running there with --cors-origin ${origin} and EUREKA_ROOM_TURN=1.`;
}

let identity=null;
export const roomIdentity=()=>identity??=createIdentity().catch(e=>{identity=null;throw e;});
const peers=new Map();
function peerFor(agent){const key=`${agent.url} ${agent.publicKey}`;if(!peers.has(key))peers.set(key,roomIdentity().then(id=>new EurekaPeer({url:agent.url,publicKey:agent.publicKey,identity:id})));return peers.get(key);}
/** One approved-plan request to an agent: its signed result, or an error the room can show. Never a room turn. */
export async function agentRequest(agent,capability,payload,{signal=AbortSignal.timeout(30000),peer=peerFor}={}){try{return await (await peer(agent)).request(capability,payload,signal);}catch(e){throw e instanceof EurekaError&&e.kind==='network'?new Error(await explainUnreachable(agent)):e;}}
/** Handshake only: used by "Check" in the allowlist. */
export async function checkAgent(agent){try{const peer=await peerFor(agent);return await peer.handshake(AbortSignal.timeout(15000));}catch(e){throw e instanceof EurekaError&&e.kind==='network'?new Error(await explainUnreachable(agent)):e;}}

/**
 * The room's generate() for an external agent member. Yields what was sent, then the signed reply with its provenance.
 * The reply text is the agent's claim, verified only as coming from the pinned key, never as true.
 */
export async function* agentTurn({member,system,messages,signal,planSeat=false},{agents=loadAgents(),peer=peerFor}={}){
  const agent=agents.find(a=>a.id===member.model);
  if(!agent)throw new Error('This agent is no longer in your allowlist. Add it again under Connections → External agents, or remove it from the team.');
  const {payload,sent}=buildTurn({system,messages,grants:turnGrants(member,{planSeat})});
  yield {sent:{...sent,to:agent.label,nodeId:agent.nodeId}};
  let reply;
  try{reply=await (await peer(agent)).turn(payload,signal);}
  catch(e){if(e instanceof EurekaError&&e.kind==='network')throw new Error(await explainUnreachable(agent));throw e;}
  yield {provenance:{kind:'eureka',capability:ROOM_TURN,agent:agent.label,nodeId:reply.peerId,publicKey:agent.publicKey,model:reply.model,taskId:reply.taskId,nonce:reply.nonce,signature:reply.signature,verified:true,truncated:reply.truncated}};
  yield {text:reply.text};
}
