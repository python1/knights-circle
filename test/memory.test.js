import {test} from 'node:test';import assert from 'node:assert/strict';import {snapshot,reserveTurn,isLoop,usageTotals,saveRoom,loadRoom,listRooms,RoomConflict} from '../src/memory.js';import {createRoom} from '../src/rooms.js';
test('snapshot excludes credentials at room and member levels',()=>{const r=createRoom();r.key='secret';r.members=[{id:'a',key:'secret',provider:'openai',prompt:'role'}];assert.ok(!JSON.stringify(snapshot(r)).includes('secret'));});
test('allocation cannot exceed configured cap',()=>{const r=createRoom();r.budget={cap:.3,perTurn:.1,reserved:0};for(let i=0;i<3;i++)reserveTurn(r,{provider:'openai'});assert.equal(r.budget.reserved,.3);assert.throws(()=>reserveTurn(r,{provider:'openai'}),/cap/);});
test('invalid allocations fail closed',()=>{const r=createRoom();r.budget={cap:1,perTurn:NaN,reserved:0};assert.throws(()=>reserveTurn(r,{provider:'openai'}),/valid/);});
test('local inference reserves no provider dollars',()=>{const r=createRoom();assert.equal(reserveTurn(r,{provider:'ollama'}),0);});
test('storage failure stops continuation',()=>{assert.throws(()=>saveRoom(createRoom(),{setItem(){throw new Error('quota');}}),/could not be saved/);});
test('streaming snapshots recover as interrupted and paused',()=>{const r=createRoom();r.status='running';r.messages=[{text:'partial',status:'streaming'}];const s=snapshot(r);assert.equal(s.status,'paused');assert.equal(s.messages[0].status,'interrupted');});
test('loop detector catches three repeated completed model replies',()=>{const r=createRoom();r.messages=Array.from({length:3},()=>({memberId:'a',status:'complete',text:'This is a repeated model response.'}));assert.equal(isLoop(r),true);r.messages[2].text='A new idea';assert.equal(isLoop(r),false);});
test('token usage aggregates per participant across formats',()=>{const r=createRoom();r.messages=[{memberId:'a',usage:{prompt_tokens:3,completion_tokens:4}},{memberId:'a',usage:{input_tokens:2,output_tokens:5}}];assert.deepEqual(usageTotals(r).a,{input:5,output:9,reported:true});});
test('free models reserve $0 and run under a $0 cap; paid models are blocked by it',()=>{const r=createRoom();r.budget={cap:0,perTurn:.1,reserved:0};for(let i=0;i<5;i++)assert.equal(reserveTurn(r,{provider:'openrouter',model:'x:free'},true),0);assert.equal(reserveTurn(r,{provider:'ollama'}),0);assert.equal(r.budget.reserved,0);assert.throws(()=>reserveTurn(r,{provider:'openrouter',model:'paid'},false),/cap is \$0, so only free models/);assert.equal(r.budget.reserved,0);});
test('a free model reserves nothing under a positive cap too',()=>{const r=createRoom();r.budget={cap:1,perTurn:.1,reserved:0};reserveTurn(r,{provider:'openrouter'},true);reserveTurn(r,{provider:'openrouter'},false);assert.equal(r.budget.reserved,.1);});
test('saved rooms keep a failed turn and its reason',()=>{const r=createRoom();r.messages=[{id:'1',memberId:'a',speaker:'Critic',text:'',status:'error',error:'This free model is busy or out of free requests. Try again later or pick another model.'},{id:'2',memberId:'b',speaker:'Lead',text:'ok',status:'complete'}];const s=snapshot(r);assert.equal(s.messages[0].error,r.messages[0].error);assert.ok(!('error' in s.messages[1]));});

test('rooms without Verified Memory save exactly as before; memory settings are saved when present',()=>{const room={id:'r',name:'n',objective:'o',mode:'round-robin',members:[],messages:[],turn:0,turnCap:3,status:'idle'};assert.equal('memory' in snapshot(room),false);const memory={pack:{title:'t',manifest:'a'.repeat(64),fingerprint:'SHA256:x',sequence:2,expires:'2031-01-01T00:00:00Z',records:4},proposals:[{id:'p',statement:'s',quote:'q',status:'pending'}]};assert.deepEqual(snapshot({...room,memory}).memory,memory);});
test('opening a saved room loads exactly its own team, fresh from storage',()=>{const data=new Map(),storage={get length(){return data.size;},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  const a=createRoom(),b=createRoom();a.name='Learning to code';a.members=[{id:'1',role:'Lead',provider:'ollama',model:'qwen3:8b',prompt:'Lead.'},{id:'2',role:'Critic',provider:'ollama',model:'nemotron-mini',prompt:'Critic.'}];b.name='Other';b.members=[{id:'3',role:'Solo',provider:'ollama',model:'qwen3:8b',prompt:'Solo.'}];saveRoom(a,storage);saveRoom(b,storage);
  const opened=loadRoom(a.id,storage);opened.members.push({id:'4',role:'Planner'},{id:'5',role:'Reviewer'});
  assert.deepEqual(loadRoom(a.id,storage).members.map(m=>m.role),['Lead','Critic']);assert.deepEqual(loadRoom(b.id,storage).members.map(m=>m.role),['Solo']);assert.equal(loadRoom('missing',storage),null);});
const memoryStorage=()=>{const data=new Map();return {data,get length(){return data.size;},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};
test('two tabs never silently overwrite each other’s saved room',()=>{const storage=memoryStorage(),r=createRoom();r.name='Shared';saveRoom(r,storage);
  // The same saved room opened in two tabs.
  const tabA=loadRoom(r.id,storage),tabB=loadRoom(r.id,storage);
  tabA.objective='A’s change';saveRoom(tabA,storage);saveRoom(tabA,storage);  // a tab can keep saving its own room
  tabB.objective='B’s older copy';
  assert.throws(()=>saveRoom(tabB,storage),e=>e instanceof RoomConflict&&e.saved.objective==='A’s change'&&/another tab/.test(e.message));
  assert.equal(loadRoom(r.id,storage).objective,'A’s change');
  // Replacing is an explicit choice; afterwards the other tab is the one that must choose.
  saveRoom(tabB,storage,{force:true});assert.equal(loadRoom(r.id,storage).objective,'B’s older copy');
  assert.throws(()=>saveRoom(tabA,storage),RoomConflict);
  // Reopening the saved version catches up.
  const reopened=loadRoom(r.id,storage);reopened.name='Again';saveRoom(reopened,storage);assert.equal(listRooms(storage).length,1);});
test('rooms saved before revisions existed, and brand-new rooms, save normally',()=>{const storage=memoryStorage(),old=createRoom();
  storage.setItem('collaboration.room.v1.'+old.id,JSON.stringify({...snapshot(old)}));const opened=loadRoom(old.id,storage);opened.name='Updated';saveRoom(opened,storage);
  assert.equal(loadRoom(old.id,storage).name,'Updated');assert.equal(loadRoom(old.id,storage).rev,1);
  const fresh=createRoom();saveRoom(fresh,storage);assert.equal(fresh.rev,1);assert.equal(listRooms(storage).length,2);});
