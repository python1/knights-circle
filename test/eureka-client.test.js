import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonical,signedBytes,verify,nodeIdOf,createIdentity,EurekaPeer,EurekaError,DOMAINS} from '../src/eureka-client.js';

// The shared contract with the Python implementation, copied from eureka_protocol vectors/signatures-v1.json.
const vectors=JSON.parse(readFileSync(new URL('./fixtures/eureka/signatures-v1.json',import.meta.url),'utf8'));
const hex=b=>Buffer.from(b).toString('hex');
const memoryStore=()=>{let saved;return {get:async()=>saved,put:async p=>{saved=p;}};};

test('canonical bytes match the Python implementation for all 30 shared vectors, and its signatures verify',async()=>{
  assert.equal(vectors.vectors.length,30);
  for(const v of vectors.vectors){
    assert.equal(DOMAINS[v.domain],v.domain_tag);
    assert.equal(hex(signedBytes(v.domain,v.payload)),v.signed_bytes_hex,v.domain);
    assert.ok(await verify(vectors.public_key,v.signature,v.domain,v.payload),v.domain);
    assert.equal(await verify(vectors.public_key,v.signature,v.domain,{...v.payload,extra:1}),false);
  }
  assert.equal(await nodeIdOf(vectors.public_key),vectors.node_id);
  const other=vectors.vectors.find(v=>v.domain==='handshake');
  assert.equal(await verify(vectors.public_key,other.signature,'handshake_offer',other.payload),false,'a signature is bound to its domain');
});
test('canonical JSON escapes like Python and refuses what the contract excludes',()=>{
  assert.equal(canonical({b:'é\x7f🙂',a:[1,true,null]}),'{"a":[1,true,null],"b":"\\u00e9\\u007f\\ud83d\\ude42"}');
  for(const bad of [1.5,NaN,2**53,undefined,()=>1])assert.throws(()=>canonical({x:bad}));
});
test('the room identity is non-extractable, persists in its store, and signs only Eureka request domains',async()=>{
  const store=memoryStore(),me=await createIdentity(store),again=await createIdentity(store);
  assert.equal(me.extractable,false);assert.equal(again.publicKey,me.publicKey);assert.equal(me.nodeId,await nodeIdOf(me.publicKey));
  const pair=await store.get();await assert.rejects(crypto.subtle.exportKey('pkcs8',pair.privateKey));
  const payload={protocol:'eureka/1.0',n:1};
  assert.ok(await verify(me.publicKey,await me.sign('assign_query',payload),'assign_query',payload));
  for(const domain of ['handshake','assign_result','audit_log','sshsig','verified-memory-pack-v1'])await assert.rejects(me.sign(domain,payload),/does not sign|unknown signing domain/);
});

// A JavaScript stand-in for the Python daemon's responder side, with switches for each way it can misbehave.
async function fakeDaemon({trusted=[],bad={}}={}){
  const pair=await crypto.subtle.generateKey({name:'Ed25519'},false,['sign','verify']);
  const publicKey=hex(await crypto.subtle.exportKey('raw',pair.publicKey)),nodeId=await nodeIdOf(publicKey);
  const signer=bad.signWith?await crypto.subtle.generateKey({name:'Ed25519'},false,['sign','verify']):pair;
  const sign=async(domain,p)=>Buffer.from(await crypto.subtle.sign({name:'Ed25519'},signer.privateKey,signedBytes(domain,p))).toString('base64');
  const state={authenticated:new Map(),pending:new Map(),turns:[],handshakes:0,last:null};
  const reply=body=>({json:async()=>JSON.parse(JSON.stringify(body)),status:200});
  async function fetcher(url,init={}){
    if(bad.offline)throw new TypeError('Failed to fetch');
    const path=new URL(url).pathname,body=init.body&&JSON.parse(init.body);
    if(path==='/v1/manifest')return reply({node_id:nodeId,runtime:'fake'});
    if(path==='/v1/handshake/offer'){
      if(!await verify(body.public_key,body.signature,'handshake_offer',body.challenge))return reply({authenticated:false,reason:'signature_verification_failed'});
      if(!trusted.includes(body.public_key))return reply({authenticated:false,reason:'untrusted_key'});
      const counter={protocol:'eureka/1.0',event:'handshake_challenge',initiator_id:nodeId,peer_id:body.initiator_id,nonce:crypto.randomUUID(),timestamp:new Date().toISOString()};
      state.pending.set(counter.nonce,body.public_key);state.handshakes++;
      return reply({event:'handshake_response',responder_id:nodeId,challenge:body.challenge,signature:await sign('handshake',body.challenge),public_key:publicKey,counter_challenge:counter});
    }
    if(path==='/v1/handshake/confirm'){
      const key=state.pending.get(body.challenge.nonce);
      if(!key||key!==body.public_key||!await verify(key,body.signature,'handshake_confirm',body.challenge))return reply({authenticated:false,reason:'signature_verification_failed'});
      state.authenticated.set(body.initiator_id,key);return reply({authenticated:true,reason:'authenticated'});
    }
    if(path==='/v1/assign'){
      const q=body.query;
      if(!await verify(body.public_key,body.signature,'assign_query',q))return reply({event:'assign_rejected',reason:'signature_verification_failed',result:{}});
      if(state.authenticated.get(q.requester_id)!==body.public_key)return reply({event:'assign_rejected',reason:'not_authenticated',result:{}});
      state.turns.push(q.payload);
      const result={protocol:'eureka/1.0',event:'assign_result',task_id:crypto.randomUUID(),status:'completed',reason:'ok',capability:q.capability,task_name:q.task_name,responder_id:nodeId,requester_id:q.requester_id,nonce:q.nonce,output:{model:'qwen3.5:4b',text:`Agent says: ${q.payload.messages.at(-1).content} — “quoted” 🌱`,chars:1,truncated:false,done_reason:'stop',eval_count:3},timestamp:new Date().toISOString()};
      const answer={event:'assign_answer',responder_id:nodeId,reason:'authenticated',result,result_signature:await sign('assign_result',result)};
      if(bad.forgetAfterFirst&&state.turns.length===1)state.authenticated.clear();
      if(bad.tamper)answer.result.output.text='Something the agent never signed';
      if(bad.replay&&state.last)return reply(state.last);
      state.last=answer;return reply(answer);
    }
    return reply({});
  }
  return {fetcher,publicKey,nodeId,state};
}
const turnPayload=text=>({messages:[{role:'system',content:'You are the Critic.'},{role:'user',content:text}]});

test('a handshake and a signed room turn against a trusting agent return its verified reply',async()=>{
  const me=await createIdentity(memoryStore());
  const trusting=await fakeDaemon({trusted:[me.publicKey]});
  const peer=new EurekaPeer({url:'http://127.0.0.1:8765/',publicKey:trusting.publicKey,identity:me,fetcher:trusting.fetcher});
  const reply=await peer.turn(turnPayload('Plan the beds'));
  assert.equal(reply.text,'Agent says: Plan the beds — “quoted” 🌱');assert.equal(reply.peerId,trusting.nodeId);assert.equal(reply.model,'qwen3.5:4b');
  assert.equal(trusting.state.handshakes,1);assert.deepEqual(trusting.state.turns,[turnPayload('Plan the beds')]);
  await peer.turn(turnPayload('again'));assert.equal(trusting.state.handshakes,1,'one handshake per session');
});
test('the agent refuses a room key it does not trust, with a reason the person can act on',async()=>{
  const me=await createIdentity(memoryStore()),daemon=await fakeDaemon({trusted:[]});
  const peer=new EurekaPeer({url:'http://127.0.0.1:8765',publicKey:daemon.publicKey,identity:me,fetcher:daemon.fetcher});
  await assert.rejects(peer.turn(turnPayload('hi')),e=>e instanceof EurekaError&&e.reason==='untrusted_key'&&/trust file/.test(e.message));
  assert.equal(daemon.state.turns.length,0);
});
test('a different agent at the pinned address, or one signing with another key, is refused before any turn',async()=>{
  const me=await createIdentity(memoryStore()),real=await fakeDaemon({trusted:[]}),impostor=await fakeDaemon({trusted:[me.publicKey]});
  const wrongNode=new EurekaPeer({url:'http://127.0.0.1:8765',publicKey:real.publicKey,identity:me,fetcher:impostor.fetcher});
  await assert.rejects(wrongNode.turn(turnPayload('hi')),e=>e.reason==='wrong_node');
  const forger=await fakeDaemon({trusted:[me.publicKey],bad:{signWith:true}});
  await assert.rejects(new EurekaPeer({url:'http://127.0.0.1:8765',publicKey:forger.publicKey,identity:me,fetcher:forger.fetcher}).turn(turnPayload('hi')),e=>e.reason==='bad_signature');
  assert.equal(impostor.state.turns.length+forger.state.turns.length,0);
});
test('a reply altered after signing, or a replayed earlier reply, is discarded',async()=>{
  const me=await createIdentity(memoryStore());
  const tamper=await fakeDaemon({trusted:[me.publicKey],bad:{tamper:true}});
  await assert.rejects(new EurekaPeer({url:'http://127.0.0.1:1',publicKey:tamper.publicKey,identity:me,fetcher:tamper.fetcher}).turn(turnPayload('hi')),e=>e.reason==='bad_result');
  const replay=await fakeDaemon({trusted:[me.publicKey],bad:{replay:true}}),peer=new EurekaPeer({url:'http://127.0.0.1:1',publicKey:replay.publicKey,identity:me,fetcher:replay.fetcher});
  await peer.turn(turnPayload('first'));
  await assert.rejects(peer.turn(turnPayload('second')),e=>e.reason==='bad_result','a valid signature over another request’s result is not an answer');
});
test('when the daemon forgets this browser (a restart), the client handshakes once more and continues',async()=>{
  const me=await createIdentity(memoryStore()),daemon=await fakeDaemon({trusted:[me.publicKey],bad:{forgetAfterFirst:true}});
  const peer=new EurekaPeer({url:'http://127.0.0.1:1',publicKey:daemon.publicKey,identity:me,fetcher:daemon.fetcher});
  await peer.turn(turnPayload('one'));const second=await peer.turn(turnPayload('two'));
  assert.match(second.text,/two/);assert.equal(daemon.state.handshakes,2);
});
test('an unreachable agent is a network error, not a refusal',async()=>{
  const me=await createIdentity(memoryStore()),daemon=await fakeDaemon({bad:{offline:true}});
  await assert.rejects(new EurekaPeer({url:'http://127.0.0.1:1',publicKey:daemon.publicKey,identity:me,fetcher:daemon.fetcher}).turn(turnPayload('hi')),e=>e.kind==='network');
});
