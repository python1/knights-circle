import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAgent,addAgent,loadAgents,saveAgents,agentsKey,buildTurn,describeSent,defaultGrants,explainUnreachable,agentTurn,TURN_LIMITS} from '../src/agents.js';
import {EurekaError} from '../src/eureka-client.js';
import {RoomRunner} from '../src/rooms.js';
import {snapshot} from '../src/memory.js';

const KEY='ab'.repeat(32);
const memoryStorage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};};

test('the allowlist accepts only loopback agents pinned by a 64-hex key',async()=>{
  assert.deepEqual(validateAgent({label:' Garden ',url:'http://127.0.0.1:8765/',publicKey:KEY.toUpperCase()}),{label:'Garden',url:'http://127.0.0.1:8765',publicKey:KEY});
  for(const url of ['http://localhost:8765','https://127.0.0.1:8765','http://192.168.1.5:8765','http://127.0.0.1','http://127.0.0.1:99999','http://127.0.0.1:8765/v1'])assert.throws(()=>validateAgent({label:'a',url,publicKey:KEY}),/127\.0\.0\.1/,url);
  for(const publicKey of ['','ab',KEY+'00','zz'.repeat(32)])assert.throws(()=>validateAgent({label:'a',url:'http://127.0.0.1:1',publicKey}),/64 hexadecimal/);
  assert.throws(()=>validateAgent({label:'',url:'http://127.0.0.1:1',publicKey:KEY}),/name/);
  const list=await addAgent([],{label:'Garden',url:'http://127.0.0.1:8765',publicKey:KEY});
  assert.match(list[0].nodeId,/^node_[0-9a-f]{8}$/);await assert.rejects(addAgent(list,{label:'Again',url:'http://127.0.0.1:1',publicKey:KEY}),/already/);
  const storage=memoryStorage();saveAgents(list,storage);assert.deepEqual(loadAgents(storage),list);
  storage.setItem(agentsKey,JSON.stringify([{id:'x',label:'bad',url:'https://evil.example',publicKey:KEY},...list]));assert.equal(loadAgents(storage).length,1);
  storage.setItem(agentsKey,'not json');assert.deepEqual(loadAgents(storage),[]);
});

const system='You are the Critic. Objective: plan';
const objective={role:'user',content:'Plan the open day'};
const transcript=n=>Array.from({length:n},(_,i)=>({role:'user',content:`[Lead]\nmessage ${i+1}`}));
test('a turn sends the room instructions, the objective and only the granted slice of the transcript',()=>{
  const messages=[objective,...transcript(6)];
  assert.deepEqual(defaultGrants(),{transcript:'last1',memory:false,propose:false});
  const first=buildTurn({system,messages});
  assert.deepEqual(first.payload.messages.map(m=>m.content),[system,objective.content,'[Lead]\nmessage 6']);
  assert.equal(first.payload.messages[0].role,'system');assert.deepEqual(first.sent,{messages:1,of:6,trimmed:false,memory:false,propose:false,chars:first.sent.chars});
  assert.equal(buildTurn({system,messages,grants:{transcript:'objective'}}).payload.messages.length,2);
  assert.equal(buildTurn({system,messages,grants:{transcript:'last4'}}).sent.messages,4);
  assert.equal(buildTurn({system,messages,grants:{transcript:'all'}}).sent.messages,6);
  assert.equal(describeSent(first.sent,'Garden (node_1)'),'Sent to Garden (node_1): room instructions, the objective and the last 1 of 6 messages, no Verified Memory, no memory proposals.');
  assert.match(describeSent(buildTurn({system,messages,grants:{transcript:'objective',memory:true,propose:true}}).sent,'G'),/the objective only, Verified Memory records, may propose memory/);
});
test('a turn is trimmed oldest first to the agent’s caps, and says so',()=>{
  const big=Array.from({length:10},(_,i)=>({role:'user',content:`${i}`.padEnd(10000,'x')}));
  const out=buildTurn({system,messages:[objective,...big],grants:{transcript:'all'}});
  assert.ok(out.sent.chars<=TURN_LIMITS.chars);assert.ok(out.sent.trimmed);assert.equal(out.payload.messages.at(-1).content[0],'9');
  assert.equal(out.payload.messages.length,2+out.sent.messages);
  const many=buildTurn({system,messages:[objective,...transcript(400)],grants:{transcript:'all'}});
  assert.equal(many.payload.messages.length,TURN_LIMITS.messages);
  assert.throws(()=>buildTurn({system:'x'.repeat(TURN_LIMITS.chars+1),messages:[objective]}),/longer than an agent turn allows/);
});
test('an unreachable agent is explained by the browser’s own rule first',async()=>{
  const agent={url:'http://127.0.0.1:8765'};
  const safari={userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3.1 Safari/605.1.15'};
  assert.match(await explainUnreachable(agent,{nav:safari,protocol:'https:',origin:'https://k'}),/Safari blocks/);
  const chrome=state=>({userAgentData:{brands:[{brand:'Google Chrome'}]},permissions:{query:async()=>({state})}});
  assert.match(await explainUnreachable(agent,{nav:chrome('denied'),protocol:'https:',origin:'https://k'}),/blocked this site.*allow local network access/);
  assert.match(await explainUnreachable(agent,{nav:chrome('prompt'),protocol:'https:',origin:'https://k'}),/Choose Allow/);
  assert.match(await explainUnreachable(agent,{nav:chrome('granted'),protocol:'https:',origin:'https://knights-circle.vercel.app'}),/--cors-origin https:\/\/knights-circle\.vercel\.app and EUREKA_ROOM_TURN=1/);
});
test('an agent turn yields what was sent, then the signed reply with its provenance',async()=>{
  const agents=[{id:'a1',label:'Garden',url:'http://127.0.0.1:8765',publicKey:KEY,nodeId:'node_12345678'}];
  let asked;const peer=async()=>({turn:async payload=>{asked=payload;return {text:'Stake the beds.',model:'qwen3.5:4b',truncated:false,taskId:'t',nonce:'n',signature:'s',peerId:'node_12345678'};}});
  const member={provider:'eureka',model:'a1',grants:{transcript:'objective',memory:false,propose:false}};
  const events=[];for await(const e of agentTurn({member,system,messages:[objective,...transcript(3)]},{agents,peer}))events.push(e);
  assert.equal(asked.messages.length,2);
  assert.deepEqual(events[0].sent,{messages:0,of:3,trimmed:false,memory:false,propose:false,chars:events[0].sent.chars,to:'Garden',nodeId:'node_12345678'});
  assert.equal(events[1].provenance.verified,true);assert.equal(events[1].provenance.nodeId,'node_12345678');assert.equal(events[2].text,'Stake the beds.');
  await assert.rejects(async()=>{for await(const _ of agentTurn({member:{...member,model:'gone'},system,messages:[objective]},{agents,peer}));},/no longer in your allowlist/);
  const offline=async()=>({turn:async()=>{throw new EurekaError('network','unreachable','Failed to fetch');}});
  await assert.rejects(async()=>{for await(const _ of agentTurn({member,system,messages:[objective]},{agents,peer:offline}));},/Couldn’t reach the agent|blocks|Allow/);
});
test('the room records what an agent was sent and its provenance, labels it, and saves both',async()=>{
  const room={id:'r',name:'R',objective:'Plan',mode:'round-robin',turnCap:1,turn:0,status:'idle',messages:[],members:[{id:'m1',provider:'eureka',model:'a1',label:'Garden · external agent node_12345678',role:'Critic',prompt:'Challenge it.',grants:{transcript:'last1',memory:false,propose:false}}]};
  let args;const generate=async function*(a){args=a;yield {sent:{messages:0,of:0,to:'Garden',nodeId:'node_12345678'}};yield {provenance:{kind:'eureka',nodeId:'node_12345678',verified:true}};yield {text:'Reply'};};
  await new RoomRunner(room,{generate,keyFor:()=>undefined}).run();
  assert.equal(args.member,room.members[0]);
  const reply=room.messages[0];assert.equal(reply.speaker,'Critic · Garden · external agent node_12345678');assert.equal(reply.provenance.kind,'eureka');assert.equal(reply.sent.to,'Garden');
  const saved=snapshot(room);assert.deepEqual(saved.members[0].grants,{transcript:'last1',memory:false,propose:false});assert.equal(saved.members[0].label,room.members[0].label);
  assert.equal(saved.messages[0].provenance.nodeId,'node_12345678');assert.equal(saved.messages[0].sent.to,'Garden');
});
