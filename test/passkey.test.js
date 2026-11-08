import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {approvalChallenge,approvalBytes,makeApproval,signApproval,createPasskey,fingerprint,approverCommand,b64url,unb64url,loadApprover,saveApprover,forgetApprover,passkeyProblem,APPROVAL_DOMAIN,DEFAULT_ORIGIN} from '../src/passkey.js';

const vectors=JSON.parse(readFileSync(new URL('./fixtures/eureka/plans-v1.json',import.meta.url),'utf8'));
const enc=new TextEncoder(),sha=async b=>new Uint8Array(await crypto.subtle.digest('SHA-256',b));

// DER ECDSA signature <-> the raw r||s WebCrypto uses.
function derToRaw(der){let i=2;const int=()=>{i++;const len=der[i++];let v=der.slice(i,i+len);i+=len;while(v.length>32&&v[0]===0)v=v.slice(1);const out=new Uint8Array(32);out.set(v,32-v.length);return out;};const r=int(),s=int();return new Uint8Array([...r,...s]);}
function rawToDer(raw){const part=b=>{let v=[...b];while(v.length>1&&v[0]===0&&!(v[1]&0x80))v.shift();if(v[0]&0x80)v.unshift(0);return [0x02,v.length,...v];};const body=[...part(raw.slice(0,32)),...part(raw.slice(32))];return new Uint8Array([0x30,body.length,...body]);}
// What eureka-daemon checks of an assertion (rust/src/approval.rs), for the tests to hold signApproval's output to.
async function daemonAccepts(approver,approval,assertion){
  const client=JSON.parse(new TextDecoder().decode(unb64url(assertion.client_data_json))),data=unb64url(assertion.authenticator_data);
  if(assertion.credential_id!==approver.credentialId||client.type!=='webauthn.get'||client.origin!==approver.origin)return false;
  if(client.challenge!==b64url(await approvalChallenge(approval)))return false;
  if(Buffer.from(data.slice(0,32)).toString('hex')!==Buffer.from(await sha(enc.encode(new URL(approver.origin).hostname))).toString('hex')||(data[32]&5)!==5)return false;
  const key=await crypto.subtle.importKey('spki',unb64url(approver.publicKey),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  return crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,derToRaw(unb64url(assertion.signature)),new Uint8Array([...data,...await sha(unb64url(assertion.client_data_json))]));
}

// A stand-in authenticator: a real P-256 key in WebCrypto, answering create() and get() as a browser would.
async function fakeAuthenticator({flags=0x05,alg=-7,origin=DEFAULT_ORIGIN,rpId='knights-circle.vercel.app',tamper}={}){
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const spki=new Uint8Array(await crypto.subtle.exportKey('spki',pair.publicKey)),rawId=crypto.getRandomValues(new Uint8Array(16));
  const calls=[];
  const credentials={
    async create(options){calls.push(options);const rp=await rpHash();return {rawId:rawId.buffer,response:{getPublicKey:()=>spki.buffer,getPublicKeyAlgorithm:()=>alg,getAuthenticatorData:()=>new Uint8Array([...rp,flags,0,0,0,0]).buffer}};},
    async get(options){
      calls.push(options);const o=options.publicKey;
      const client=enc.encode(JSON.stringify({type:'webauthn.get',challenge:b64url(o.challenge),origin,crossOrigin:false}));
      const data=new Uint8Array([...await sha(enc.encode(rpId)),flags,0,0,0,7]);
      const signed=new Uint8Array([...data,...await sha(client)]);
      const raw=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,signed));
      const answer={rawId:rawId.buffer,response:{authenticatorData:data.buffer,clientDataJSON:client.buffer,signature:rawToDer(raw).buffer}};
      return tamper?tamper(answer):answer;
    }};
  async function rpHash(){return [...await sha(enc.encode(rpId))];}
  return {credentials,calls,approver:{credentialId:b64url(rawId),publicKey:b64url(spki),fingerprint:await fingerprint(b64url(spki)),origin}};
}
globalThis.PublicKeyCredential??=class{};

const fields={kind:'run',planHash:vectors.approvals[0].approval.plan_hash,seatId:'node_0123abcd',requesterId:'node_89abcdef',roomId:'7d3c1f2e-0000-4000-8000-000000000001'};

test('approval challenges match eureka-daemon’s for all 16 shared vectors',async()=>{
  assert.equal(vectors.domains.approval,APPROVAL_DOMAIN);assert.equal(vectors.approvals.length,16);
  for(const v of vectors.approvals)assert.equal(b64url(await approvalChallenge(v.approval)),v.challenge,v.name);
});
test('the shared vectors’ good assertions verify as authenticator data followed by the client data’s hash',async()=>{
  const approver={credentialId:vectors.approver.credential_id,publicKey:vectors.approver.public_key,origin:vectors.approver.origin};
  for(const name of ['a good run approval','a good apply approval']){const v=vectors.approvals.find(a=>a.name===name);assert.ok(await daemonAccepts(approver,v.approval,v.assertion),name);}
  const other=vectors.approvals.find(a=>a.name==='signed over a different approval');assert.equal(await daemonAccepts(approver,other.approval,other.assertion),false);
});
test('the fingerprint is the one eureka-daemon approver add prints, and the command pins this site',async()=>{
  assert.equal(await fingerprint(vectors.approver.public_key),vectors.approver.fingerprint);
  const a={credentialId:'abc',publicKey:'def',origin:DEFAULT_ORIGIN};
  assert.equal(approverCommand(a),'eureka-daemon approver add abc def');
  assert.equal(approverCommand({...a,origin:'http://localhost:8080'}),'eureka-daemon approver add abc def --origin http://localhost:8080');
});
test('an approval is fresh, single-use and bound, with exactly the daemon’s fields, and lasts 10 minutes',()=>{
  const run=makeApproval({...fields,now:1_800_000_000_500});
  assert.deepEqual(Object.keys(run).sort(),['approval_id','expires_at','issued_at','kind','plan_hash','requester_id','room_id','seat_id']);
  assert.equal(run.issued_at,1_800_000_000);assert.equal(run.expires_at-run.issued_at,600);assert.match(run.approval_id,/^[0-9a-f]{32}$/);
  assert.notEqual(makeApproval(fields).approval_id,makeApproval(fields).approval_id);
  const apply=makeApproval({...fields,kind:'apply',apply:{runId:'a1'.repeat(16),diffHash:'d4'.repeat(32),baseCommit:'c0ffee'.padEnd(40,'0')}});
  assert.deepEqual(Object.keys(apply).sort(),['approval_id','base_commit','diff_hash','expires_at','issued_at','kind','plan_hash','requester_id','room_id','run_id','seat_id']);
  for(const bad of [{kind:'delete'},{planHash:'ABC'},{seatId:'node_xyz'},{requesterId:''},{roomId:'a b'},{roomId:'x'.repeat(65)},{apply:{runId:'a1'.repeat(16)}},{kind:'apply'},{kind:'apply',apply:{runId:'a1'.repeat(16),diffHash:'D4'.repeat(32),baseCommit:'c'.repeat(40)}}])
    assert.throws(()=>makeApproval({...fields,...bad}),undefined,JSON.stringify(bad));
  assert.ok(approvalBytes(run).length>APPROVAL_DOMAIN.length+1);
});
test('creating the passkey asks for P-256 with the user verified, and shows the credential id, public key and fingerprint',async()=>{
  const auth=await fakeAuthenticator();
  const a=await createPasskey({credentials:auth.credentials,rpId:'knights-circle.vercel.app',origin:DEFAULT_ORIGIN,now:0});
  const o=auth.calls[0].publicKey;
  assert.deepEqual(o.pubKeyCredParams,[{type:'public-key',alg:-7}]);assert.equal(o.authenticatorSelection.userVerification,'required');assert.equal(o.rp.id,'knights-circle.vercel.app');assert.equal(o.attestation,'none');
  assert.deepEqual({...a,created:undefined},{...auth.approver,created:undefined});assert.match(a.fingerprint,/^[0-9a-f]{4}( [0-9a-f]{4}){3}$/);
  await assert.rejects(createPasskey({credentials:(await fakeAuthenticator({alg:-8})).credentials,rpId:'x',origin:DEFAULT_ORIGIN}),/isn’t P-256/);
  await assert.rejects(createPasskey({credentials:(await fakeAuthenticator({flags:0x01})).credentials,rpId:'x',origin:DEFAULT_ORIGIN}),/didn’t verify you/);
});
test('signing asks Touch ID of the pinned passkey only, and gives an assertion eureka-daemon accepts',async()=>{
  const auth=await fakeAuthenticator(),approval=makeApproval(fields);
  const assertion=await signApproval(approval,auth.approver,{credentials:auth.credentials});
  const o=auth.calls[0].publicKey;
  assert.equal(o.userVerification,'required');assert.equal(o.rpId,'knights-circle.vercel.app');assert.equal(o.allowCredentials.length,1);assert.equal(b64url(o.allowCredentials[0].id),auth.approver.credentialId);
  assert.equal(b64url(o.challenge),b64url(await approvalChallenge(approval)));
  assert.deepEqual(Object.keys(assertion).sort(),['authenticator_data','client_data_json','credential_id','signature']);
  assert.ok(await daemonAccepts(auth.approver,approval,assertion));
  assert.equal(await daemonAccepts(auth.approver,{...approval,plan_hash:'4'.repeat(64)},assertion),false,'bound to the approval it signed');
  const apply=makeApproval({...fields,kind:'apply',apply:{runId:'a1'.repeat(16),diffHash:'d4'.repeat(32),baseCommit:'c0ffee'.padEnd(40,'0')}});
  assert.ok(await daemonAccepts(auth.approver,apply,await signApproval(apply,auth.approver,{credentials:auth.credentials})));
});
test('signing refuses an answer the daemon would refuse: no Touch ID, another passkey, another site or challenge',async()=>{
  const approval=makeApproval(fields);
  const refused=async(options,pattern)=>{const auth=await fakeAuthenticator(options);await assert.rejects(signApproval(approval,{...auth.approver,origin:DEFAULT_ORIGIN},{credentials:auth.credentials}),pattern);};
  await refused({flags:0x01},/didn’t verify you/);
  await refused({origin:'https://evil.example'},/isn’t for this approval on this site/);
  await refused({rpId:'evil.example'},/for another site/);
  await refused({tamper:a=>({...a,rawId:new Uint8Array([1,2,3]).buffer})},/other than your plan approval passkey/);
  await refused({tamper:a=>{const c=JSON.parse(new TextDecoder().decode(a.response.clientDataJSON));c.challenge='AAAA';return {...a,response:{...a.response,clientDataJSON:enc.encode(JSON.stringify(c)).buffer}};}},/isn’t for this approval/);
});
test('the approver is kept as public data in this browser, and a cancelled prompt is explained',()=>{
  const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
  assert.equal(loadApprover(storage),null);
  const a={credentialId:'abc',publicKey:'def',fingerprint:'0000 0000 0000 0000',origin:DEFAULT_ORIGIN,created:'x'};
  saveApprover(a,storage);assert.deepEqual(loadApprover(storage),a);forgetApprover(storage);assert.equal(loadApprover(storage),null);
  storage.setItem('knights-circle.plan-approver.v1','{bad');assert.equal(loadApprover(storage),null);
  assert.match(passkeyProblem({name:'NotAllowedError'}),/Nothing was signed/);
});
test('the passkey is not the room key: the room key still signs only Eureka request domains',()=>{
  const client=readFileSync(new URL('../src/eureka-client.js',import.meta.url),'utf8');
  assert.match(client,/const SIGNABLE = new Set\(\['handshake_offer', 'handshake_confirm', 'read_query', 'assign_query'\]\);/);
  assert.match(client,/handshake_offer: 'eureka\/handshake\/offer\/v1',\n  handshake: 'eureka\/handshake\/v1',\n  handshake_confirm: 'eureka\/handshake\/confirm\/v1',\n  read_query: 'eureka\/read\/query\/v1',\n  assign_query: 'eureka\/assign\/query\/v1',\n  assign_result: 'eureka\/assign\/result\/v1'\n\}\);/,'no new signing domains');
  assert.doesNotMatch(client,/approval/i,'the room key never signs an approval');
});
test('without Touch ID the owner is offered a device PIN or password, a phone by QR code, or a security key',async()=>{
  const {PASSKEY_OPTIONS,offerOptions,passkeySupport}=await import('../src/passkey.js');
  assert.equal(PASSKEY_OPTIONS.length,3);
  assert.match(PASSKEY_OPTIONS[0],/PIN or password/);assert.match(PASSKEY_OPTIONS[1],/phone.*QR code/);assert.match(PASSKEY_OPTIONS[2],/security key.*PIN/);
  for(const name of ['NotAllowedError','NotSupportedError','SecurityError'])assert.ok(offerOptions({name}),name);
  assert.ok(offerOptions(new Error('The authenticator didn’t verify you')));assert.ok(!offerOptions(new Error('the plan hash must be 64 lower-case hex digits')));
  assert.deepEqual(await passkeySupport(undefined),{supported:false,builtIn:false});
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),ui=readFileSync(new URL('../src/plan-ui.js',import.meta.url),'utf8'),help=readFileSync(new URL('../docs/external-agents.md',import.meta.url),'utf8');
  assert.match(html,/<details id="approver-help" class="approver-help"><summary>No Touch ID\? Other ways to approve<\/summary>/);
  assert.match(ui,/options\.hidden=!offerOptions\(e\)/,'the approval dialog shows them when the passkey fails');
  assert.match(help,/### No Touch ID\? Other ways to approve[\s\S]*PIN or password[\s\S]*scan the QR code[\s\S]*security key/);
});
