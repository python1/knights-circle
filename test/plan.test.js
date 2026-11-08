import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readPlan,parseJson,PyFloat,planBytes,patternMatches,planBlocks,PLAN_DOMAIN} from '../src/plan.js';
import {isLeadMessage,seatsIn,othersNote,approvalWording,plansIn} from '../src/plan-ui.js';

// The shared contract with eureka-daemon, copied from eureka_protocol vectors/plans-v1.json.
const vectors=JSON.parse(readFileSync(new URL('./fixtures/eureka/plans-v1.json',import.meta.url),'utf8'));
// Edge cases beyond the vectors, each with the verdict eureka-daemon's own Plan::parse gave.
const edges=JSON.parse(readFileSync(new URL('./fixtures/eureka/plan-edge-cases.json',import.meta.url),'utf8'));
const hex=b=>Buffer.from(b).toString('hex');

test('plans hash exactly as eureka-daemon hashes them, for every shared vector',async()=>{
  assert.equal(vectors.domains.plan,PLAN_DOMAIN);assert.equal(vectors.plans.length,4);
  for(const v of vectors.plans){
    const {plan,error}=await readPlan(v.plan_json);
    assert.equal(error,undefined,v.name);
    assert.equal(hex(planBytes(plan.value)),v.signed_bytes_hex,v.name);
    assert.equal(plan.hash,v.plan_hash,v.name);assert.equal(plan.code,v.plan_hash.slice(0,8));
  }
});
test('every refused plan in the shared vectors is refused with the same code',async()=>{
  assert.equal(vectors.invalid_plans.length,25);
  for(const v of vectors.invalid_plans)assert.equal((await readPlan(v.plan_json)).error?.code,v.code,v.name);
});
test('"eureka_plan": 1.0 is refused, as are 1e0, -0, true and "1": JSON.parse would read some of them as 1',async()=>{
  const good='{"eureka_plan": 1, "title": "t", "project": "p", "steps": ["s"], "edit": ["a"]}';
  assert.ok((await readPlan(good)).plan);
  for(const v of ['1.0','1e0','1E0','10e-1','-0','0','2','true','"1"','null','NaN','Infinity','[1]','{}'])
    assert.equal((await readPlan(good.replace('"eureka_plan": 1','"eureka_plan": '+v))).error?.code,'bad_version',v);
  assert.equal(JSON.parse(good.replace(': 1,',': 1.0,')).eureka_plan,1,'which is why a plain JSON.parse is not enough');
  assert.ok(parseJson('1.0') instanceof PyFloat);assert.equal(parseJson('1'),1);
});
test(`the daemon's verdict on ${edges.cases.length} edge cases: lengths, spaces, surrogates, globs, duplicates and limits`,async()=>{
  assert.ok(edges.cases.length>=70);
  for(const {plan_json,daemon} of edges.cases){const r=await readPlan(plan_json);assert.equal(r.plan?r.plan.hash:r.error.code,daemon,plan_json.slice(0,100));}
});
test('the JSON reader is Python’s: strict strings, last duplicate wins, no prototype, nothing after the value',()=>{
  for(const bad of ['','{','{"a":1,}','[1,]','"a\tb"','"\\ud800"','"\\udc00"','"\\x"','01','1 2','{"a" 1}',"'a'",'"\ud800"'])assert.throws(()=>parseJson(bad),SyntaxError,JSON.stringify(bad));
  const o=parseJson(' {"a":1,"a":2,"__proto__":3} ');assert.equal(o.a,2);assert.equal(Object.getPrototypeOf(o),null);assert.equal(o.__proto__,3);
  assert.equal(parseJson('"\\ud83d\\ude42"'),'🙂');assert.equal(typeof parseJson('12345678901234567890'),'bigint');
});
test('edit patterns match paths as the daemon matches them',()=>{
  for(const [pattern,path,expected] of vectors.pattern_matches)assert.equal(patternMatches(pattern,path),expected,`${pattern} ${path}`);
});
test('plan blocks are fenced eureka-plan blocks only, closed, at most five per message',()=>{
  const body='{"eureka_plan": 1}';
  assert.deepEqual(planBlocks(`Here:\n\`\`\`eureka-plan\n${body}\n\`\`\`\nDone.`),[body]);
  assert.deepEqual(planBlocks(`~~~~eureka-plan\r\n${body}\r\n~~~~\r\n`),[body]);
  assert.deepEqual(planBlocks(`\`\`\`eureka-plan\n${body}\n`),[],'an unclosed block is not a plan');
  assert.deepEqual(planBlocks(`\`\`\`json\n${body}\n\`\`\``),[]);
  assert.deepEqual(planBlocks(`  \`\`\`eureka-plan\n${body}\n\`\`\``),[],'only at the start of a line');
  assert.deepEqual(planBlocks(`\`\`\`eureka-plan extra\n${body}\n\`\`\``),[]);
  assert.equal(planBlocks(Array(7).fill(`\`\`\`eureka-plan\n${body}\n\`\`\``).join('\n')).length,5);
  assert.deepEqual(planBlocks('Approved. Go ahead and run it.'),[],'text that approves is just text');
});
test('only the Lead’s finished messages get plan cards, and only allowlisted agents in the room are seats',async()=>{
  const room={id:'r',members:[{id:'lead',role:'Lead',provider:'openai'},{id:'c',role:'Critic',provider:'eureka',model:'a1'},{id:'t',role:'Tester',provider:'eureka',model:'gone'}]};
  assert.ok(isLeadMessage({memberId:'lead',status:'complete'},room));
  assert.ok(!isLeadMessage({memberId:'lead',status:'streaming'},room));
  assert.ok(!isLeadMessage({memberId:'c',status:'complete'},room));
  assert.ok(!isLeadMessage({status:'complete'},room),'a message from no member');
  assert.deepEqual(seatsIn(room,[{id:'a1',label:'Claude',nodeId:'node_0123abcd'}]),[{id:'a1',label:'Claude',nodeId:'node_0123abcd'}]);
  assert.equal(othersNote(room),'Written in a room with 2 other members. Read every step.');
  const text='```eureka-plan\n'+vectors.plans[0].plan_json+'\n```';
  assert.equal(plansIn(text,()=>{}),null,'hashing first');await new Promise(r=>setTimeout(r,20));
  assert.equal(plansIn(text,()=>{})[0].plan.hash,vectors.plans[0].plan_hash);
});
test('the dialog says what will happen, from the plan and the seat',async()=>{
  const {plan}=await readPlan(vectors.plans[0].plan_json),seat={label:'Claude',nodeId:'node_0123abcd'};
  const run=approvalWording({kind:'run',plan,seat});
  assert.equal(run.title,`Approve plan ${plan.code}?`);
  assert.equal(run.lead,'Claude Code reads the project and may change only these files. Nothing reaches your project until you approve the diff.');
  assert.deepEqual(run.files,['src/theme.css','src/app.js']);assert.ok(run.rows.some(([k,v])=>k==='Seat'&&v==='Claude (node_0123abcd)'));
  const apply=approvalWording({kind:'apply',plan,seat,apply:{runId:'a1'.repeat(16),diffHash:'d4'.repeat(32),baseCommit:'c0ffee'.padEnd(40,'0'),files:['src/app.js']}});
  assert.match(apply.lead,new RegExp(`eureka/plan-${plan.code}`));assert.deepEqual(apply.files,['src/app.js']);
});
test('plan text reaches the page as text only, and the card is the only way to approve',()=>{
  const ui=readFileSync(new URL('../src/plan-ui.js',import.meta.url),'utf8'),room=readFileSync(new URL('../src/room-ui.js',import.meta.url),'utf8');
  assert.doesNotMatch(ui,/renderMarkdown|insertAdjacentHTML|outerHTML/);
  assert.equal(ui.match(/innerHTML/g).length,1,'only the dialog’s fixed skeleton');
  assert.doesNotMatch(ui.slice(ui.indexOf('export function planCards')),/innerHTML/);
  assert.match(room,/article\.append\(\.\.\.planCards\(m,planContext\)\)/);
  assert.doesNotMatch(room,/askApproval|plan-run\.js/,'the room screen only shows cards and notes');
  assert.equal((ui.match(/await askApproval\(/g)||[]).length,2,'approvals start only from the card’s Approve and Apply buttons');
  assert.match(ui,/approve\.onclick=\(\)=>approveAndRun\(/);assert.match(ui,/apply\.onclick=\(\)=>applyRun\(/);
});
