import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {verifyPack,checkStillFresh,explainRefusal,relevantRecords,memoryPrompt,parseProposals,findSource,buildExport,unzip,readPackFiles,validPins,packIdentity} from '../src/memory-pack.js';
import {verifyPackEntries} from '../src/vm-verify.js';
// Packs signed with throwaway test keys by the real sign-pack (verified-memory-mcp 0.4.1); the private keys were discarded.
const A='SHA256:2hmT6b4AqyaN26MUxTZNy4VBsA6bVfI+stICfueHRZI',B='SHA256:IMLnvrLRjCpML2rsGp499mxl/WSXCuQrXizC3lNneNI';
const load=dir=>new Map(readdirSync(new URL(`./fixtures/vm/${dir}/`,import.meta.url)).map(f=>[f,new Uint8Array(readFileSync(new URL(`./fixtures/vm/${dir}/${f}`,import.meta.url)))]));
const NOW=Date.parse('2027-01-01T00:00:00Z');
const refusal=async(files,opts)=>{try{await verifyPack(files,{pins:A,minSequence:0,now:NOW,...opts});}catch(e){return explainRefusal(e);}assert.fail('pack was accepted');};
const edit=(files,name,f)=>{const out=new Map(files);out.set(name,new TextEncoder().encode(f(new TextDecoder().decode(files.get(name)))));return out;};
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');

test('a pack signed by the pinned key, fresh and at the minimum sequence loads',async()=>{
  const pack=await verifyPack(load('signed-a'),{pins:A,minSequence:2,now:NOW});
  assert.equal(pack.records.size,4);assert.equal(pack.signature.status,'verified');assert.equal(pack.signature.pinned,true);assert.equal(pack.freshness.status,'fresh');assert.equal(pack.sequence,2);assert.equal(pack.title,'Larkfield garden example pack');
  assert.deepEqual(Object.keys(packIdentity(pack)),['title','manifest','fingerprint','sequence','expires','records']);
});
test('tampered, unsigned, wrongly signed, undated, expired, future-dated and rolled-back packs are refused with plain reasons',async()=>{
  const good=load('signed-a');
  assert.match(await refusal(edit(good,'records.jsonl',s=>s.replace('tomato','potato'))),/records\.jsonl was changed after the pack was sealed/);
  // Editing a record and resealing SHA256SUMS still breaks the signature.
  let resealed=edit(good,'records.jsonl',s=>s.replace('tomato','potato'));const sum=await sha(new TextDecoder().decode(resealed.get('records.jsonl')));resealed=edit(resealed,'SHA256SUMS',s=>s.replace(/^[a-f0-9]{64}(?=  records\.jsonl$)/m,sum));
  assert.match(await refusal(resealed),/signature doesn’t match these files/);
  assert.match(await refusal(edit(good,'PACK.json',s=>s.replace('2031','2032'))),/PACK\.json was changed after the pack was sealed/);
  const unsigned=new Map(good);unsigned.delete('SHA256SUMS.sig');assert.match(await refusal(unsigned),/isn’t signed/);
  assert.match(await refusal(load('signed-b')),new RegExp(`signed by a different key \\(${B.replace(/[+/]/g,'\\$&')}\\)`));
  assert.match(await refusal(load('undated-a')),/no sequence number \(or no PACK\.json at all\)/);
  assert.match(await refusal(good,{now:Date.parse('2032-01-01T00:00:00Z')}),/expired at 2031-10-30T01:58:26Z/);
  assert.match(await refusal(good,{now:Date.parse('2026-01-01T00:00:00Z')}),/in the future by this computer’s clock/);
  assert.match(await refusal(good,{minSequence:3}),/older \(sequence 2\) than the newest one accepted here \(sequence 3\)/);
  const extra=new Map(good);extra.set('.DS_Store',new Uint8Array(3));assert.match(await refusal(extra),/nothing else\. Found: \.DS_Store/);
  assert.match(await refusal(good,{pins:''}),/Paste your pinned signer fingerprint/);
  assert.match(await refusal(good,{pins:'SHA256:nope'}),/pinned fingerprint isn’t valid/);
  // Flip one bit inside the 64-byte Ed25519 signature (the last bytes of the SSHSIG blob).
  const forged=edit(good,'SHA256SUMS.sig',s=>{const body=s.split('\n').filter(l=>l&&!l.startsWith('-----')).join(''),bytes=Uint8Array.from(atob(body),c=>c.charCodeAt(0));bytes[bytes.length-10]^=1;return `-----BEGIN SSH SIGNATURE-----\n${btoa(String.fromCharCode(...bytes)).match(/.{1,70}/g).join('\n')}\n-----END SSH SIGNATURE-----\n`;});
  assert.match(await refusal(forged),/signature doesn’t match these files/);
  assert.equal(validPins(A),true);assert.equal(validPins('SHA256:x'),false);
});
test('expiry is judged again later, as the server does on every request',async()=>{
  const pack=await verifyPack(load('signed-a'),{pins:A,now:NOW});
  assert.equal(checkStillFresh(pack,NOW).status,'fresh');assert.throws(()=>checkStillFresh(pack,Date.parse('2031-11-01T00:00:00Z')),/expired/);
});
test('chosen folder files and zips are read like the pack maker reads them',async()=>{
  const files=[...load('signed-a')].map(([name,bytes])=>({name,path:`signed-a/${name}`,blob:new Blob([bytes])}));
  assert.equal((await readPackFiles(files)).size,6);
  const nested=[...files,{name:'x.txt',path:'signed-a/sub/x.txt',blob:new Blob(['x'])}];assert.ok((await readPackFiles(nested)).has('signed-a/sub/x.txt'));
});
test('models see verified records and unverified proposals in separate sections; small packs are shown whole',async()=>{
  const pack=await verifyPack(load('signed-a'),{pins:A,now:NOW});
  const prompt=memoryPrompt({pack,proposals:[{status:'pending',statement:'Rowan grows basil.',by:'Critic · m'},{status:'rejected',statement:'Hidden',by:'x'}],query:'tomato'});
  const verified=prompt.slice(prompt.indexOf('VERIFIED MEMORY'),prompt.indexOf('END VERIFIED MEMORY')),proposed=prompt.slice(prompt.indexOf('PROPOSED MEMORY (NOT VERIFIED)'),prompt.indexOf('END PROPOSED MEMORY'));
  assert.ok(verified.includes('M-garden-1')&&verified.includes('Records (4 of 4)')&&verified.includes(A));assert.ok(!verified.includes('basil'));
  assert.ok(proposed.includes('Rowan grows basil.')&&proposed.includes('pending review')&&!proposed.includes('Hidden'));
  const many=new Map(Array.from({length:400},(_,i)=>[`M-r${i}`,{record_id:`M-r${i}`,role:'user',speaker:'R',topic:'t',category:'c',statement:i===399?'The shed code is blue':`Filler statement ${i} about nothing in particular here`,date_first_utc:'2026-01-01T00:00:00Z',date_last_utc:'2026-01-01T00:00:00Z',evidence:[{message_id:1,date_utc:'2026-01-01T00:00:00Z',quote:'x',start:0,end:1,message_sha256:'0'.repeat(64)}]}]));
  const picked=relevantRecords(many,'what is the shed code?');assert.ok(picked.length<400);assert.equal(picked[0].record_id,'M-r399');
});
test('proposals are parsed from a reply and traced to the exact earlier message they quote',()=>{
  const reply='Plan below.\n\nPROPOSE MEMORY: The club meets on Tuesdays. | QUOTE: "we meet every Tuesday"\n- PROPOSE MEMORY: bad line without quote\nPROPOSE MEMORY: Club colour is green | QUOTE: “green and gold”';
  assert.deepEqual(parseProposals(reply),[{statement:'The club meets on Tuesdays.',quote:'we meet every Tuesday'},{statement:'Club colour is green',quote:'green and gold'}]);
  const room={objective:'Name our chess club; we meet every Tuesday.',messages:[{id:'a',memberId:'m1',speaker:'Lead · x',text:'Maybe green and gold?',status:'complete',at:1000},{id:'u',speaker:'You',text:'I like green and gold too',status:'complete',at:2000},{id:'r',memberId:'m2',speaker:'Critic · y',text:reply,status:'complete',at:3000}]};
  assert.deepEqual(findSource(room,'we meet every Tuesday','r'),{kind:'user',id:'objective',speaker:'You',text:room.objective,at:1000,start:21});
  assert.equal(findSource(room,'green and gold','r').id,'u');
  assert.equal(findSource(room,'Plan below','r'),null);
});
test('approved proposals export as an unsigned pack the shared verifier accepts, existing records unchanged',async()=>{
  const pack=await verifyPack(load('signed-a'),{pins:A,now:NOW});
  const room={objective:'Plan the garden open day. Rowan said the tomato beds need staking by May.',messages:[]};
  const source={kind:'user',id:'objective',speaker:'You',text:room.objective,at:Date.parse('2026-10-30T12:00:00Z'),start:26};
  const out=await buildExport(pack,[{statement:'Tomato beds need staking by May.',quote:'Rowan said the tomato beds need staking by May.',source}],{room:'Open day',now:NOW});
  const zip=await unzip(out.zip),dir=out.folder+'/';
  assert.deepEqual([...zip.keys()].sort(),[`${dir}MEMORY.md`,`${dir}README.md`,`${dir}SHA256SUMS`,`${dir}records.jsonl`,'HOW-TO-SIGN.txt','added-messages.jsonl','added-records.jsonl'].sort());
  const records=new TextDecoder().decode(zip.get(`${dir}records.jsonl`));
  assert.ok(records.startsWith(new TextDecoder().decode(load('signed-a').get('records.jsonl'))));
  const added=JSON.parse(records.trim().split('\n').at(-1));
  assert.equal(added.speaker,'Rowan');assert.equal(added.role,'user');assert.equal(added.evidence[0].message_id,6);assert.equal(added.evidence[0].message_sha256,await sha(room.objective));
  const files=new Map([...zip].filter(([k])=>k.startsWith(dir)).map(([k,v])=>[k.slice(dir.length),v]));
  const hex=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
  const digests=new Map();for(const v of files.values())digests.set(v,await hex(v));
  assert.equal(verifyPackEntries([...files.keys()],n=>files.get(n),b=>digests.get(b)).records.size,5);
  assert.match(new TextDecoder().decode(zip.get('HOW-TO-SIGN.txt')),/--sequence 3/);
  await assert.rejects(buildExport(pack,[{statement:'x',quote:'not in source',source}],{now:NOW}),/quote/);
});
