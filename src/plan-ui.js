// Plan cards and the approval dialog. A card shows a plan the room's Lead posted, exactly as hashed, as plain text. Its
// one button opens a dialog, and only Touch ID on the owner's plan approval passkey signs an approval. Room text never
// approves anything: a member writing "approved" or "go ahead" only adds text. The run, its diff and Apply follow on the
// same card, from the seat's signed results only; the diff and the progress line are shown on this card and nowhere else.
import {planBlocks,readPlan} from './plan.js';
import {makeApproval,signApproval,passkeyProblem,offerOptions,PASSKEY_OPTIONS,LIFETIME_SECONDS} from './passkey.js';
import {openModal} from './dialog.js';
import {roomIdentity} from './agents.js';
import {seatOffersPlans,knownOffer,forgetOffer,newRun,sendRun,fetchStatus,sendApply,sendDiscard,setState,applyStatus,explain,isFailure,summaryLine,ACTIVE,POLL_MS} from './plan-run.js';

const results=new Map();
/** The checked plans in a message, or null while they're being hashed (onReady runs once they are). Cached by block text. */
export function plansIn(text,onReady){
  const blocks=planBlocks(text);
  const pending=blocks.filter(b=>!results.has(b));
  if(pending.length){Promise.all(pending.map(b=>readPlan(b).then(r=>results.set(b,r)))).then(onReady,()=>{});return null;}
  return blocks.map(b=>results.get(b));
}

/** Only the Lead's finished messages get cards. */
export function isLeadMessage(message,room){return message.status==='complete'&&room.members.find(m=>m.id===message.memberId)?.role==='Lead';}

/** The seats that could run a plan: the room's external agents still in the allowlist. */
export function seatsIn(room,agents){
  return room.members.filter(m=>m.provider==='eureka').map(m=>agents.find(a=>a.id===m.model)).filter(Boolean).filter((a,i,list)=>list.findIndex(b=>b.id===a.id)===i).map(a=>({id:a.id,label:a.label,nodeId:a.nodeId}));
}

export const othersNote=room=>{const n=Math.max(0,room.members.length-1);return n?`Written in a room with ${n} other member${n===1?'':'s'}. Read every step.`:'Read every step.';};

/** What the dialog asks, for a run or an apply. Plain strings: the caller puts them in as text. */
export function approvalWording({kind,plan,seat,apply}){
  if(kind==='apply')return {
    title:`Apply plan ${plan.code} to a branch?`,
    lead:`The diff goes on a new branch, eureka/plan-${plan.code}, in your project ${plan.project}. Your checkout and working tree aren’t touched.`,
    rows:[['Plan',plan.title],['Seat',`${seat.label} (${seat.nodeId})`],['Run',apply.runId],['Diff',apply.diffHash.slice(0,16)],['From commit',apply.baseCommit.slice(0,12)]],
    files:apply.files||[]};
  return {
    title:`Approve plan ${plan.code}?`,
    lead:'Claude Code reads the project and may change only these files. Nothing reaches your project until you approve the diff.',
    rows:[['Plan',plan.title],['Seat',`${seat.label} (${seat.nodeId})`],['Project',plan.project],['Steps',`${plan.steps.length}, shown on the card`]],
    files:plan.edit};
}


let dialog=null;
function dialogElement(){
  if(dialog)return dialog;
  dialog=document.createElement('dialog');dialog.id='plan-dialog';dialog.className='leave-dialog plan-dialog';
  dialog.setAttribute('role','alertdialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','plan-dialog-title');dialog.setAttribute('aria-describedby','plan-dialog-text');
  dialog.innerHTML='<h2 id="plan-dialog-title"></h2><p id="plan-dialog-text"></p><dl id="plan-dialog-rows"></dl><p class="subtle">Files that may change</p><ul id="plan-dialog-files" class="plan-files"></ul><p id="plan-dialog-passkey" class="subtle"></p><p id="plan-dialog-status" role="status" aria-live="polite"></p><div id="plan-dialog-options" hidden><p class="subtle">If Touch ID isn’t available, you can approve with:</p><ul></ul></div><div class="actions"><button type="button" id="plan-dialog-approve" class="primary">Approve with passkey</button><button type="button" id="plan-dialog-cancel">Cancel</button></div>';
  document.body.append(dialog);return dialog;
}

/**
 * Ask the owner, then Touch ID. Resolves to {approval, assertion} once signed, or null if cancelled. The approval is
 * built from what the card shows and what this tab knows (the seat, this browser's room key, the room), never from text.
 */
export function askApproval({kind='run',plan,seat,room,requesterId,approver,apply,fallback=()=>null}){
  const d=dialogElement(),$=s=>d.querySelector(s),words=approvalWording({kind,plan,seat,apply});
  $('#plan-dialog-title').textContent=words.title;$('#plan-dialog-text').textContent=words.lead;
  $('#plan-dialog-rows').replaceChildren(...words.rows.flatMap(([k,v])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;return [dt,dd];}));
  $('#plan-dialog-files').replaceChildren(...words.files.map(f=>{const li=document.createElement('li'),code=document.createElement('code');code.textContent=f;li.append(code);return li;}));
  $('#plan-dialog-passkey').textContent=`Passkey ${approver.fingerprint}. The approval works once, for this seat and this room, for ${LIFETIME_SECONDS/60} minutes.`;
  const status=$('#plan-dialog-status'),approve=$('#plan-dialog-approve'),options=$('#plan-dialog-options');status.textContent='';approve.disabled=false;options.hidden=true;
  options.querySelector('ul').replaceChildren(...PASSKEY_OPTIONS.map(t=>{const li=document.createElement('li');li.textContent=t;return li;}));
  approve.textContent=kind==='apply'?'Apply with passkey':'Approve with passkey';
  return new Promise(resolve=>{
    let controller=null,result=null;
    approve.onclick=async()=>{
      approve.disabled=true;status.textContent='Waiting for your passkey (Touch ID)…';controller=new AbortController();
      try{
        const approval=makeApproval({kind,planHash:plan.hash,seatId:seat.nodeId,requesterId,roomId:room.id,apply});
        const assertion=await signApproval(approval,approver,{signal:controller.signal});
        result={approval,assertion};d.close('approved');
      }catch(e){if(d.open){status.textContent=passkeyProblem(e);options.hidden=!offerOptions(e);approve.disabled=false;}}
    };
    $('#plan-dialog-cancel').onclick=()=>d.close('');
    d.addEventListener('close',()=>{controller?.abort();resolve(d.returnValue==='approved'?result:null);},{once:true});
    openModal(d,{cancelValue:'',fallback});
  });
}

const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const button=(text,cls='')=>{const b=el('button',cls,text);b.type='button';return b;};
const time=s=>new Date(s*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
export const STATE_LABEL={sending:'Approved · sending',running:'Running',applying:'Applying',diff_ready:'Diff ready',no_changes:'Finished · no changes',applied:'Applied',discarded:'Discarded'};
const stateLabel=status=>STATE_LABEL[status]||'Failed';
const runsFor=(room,message,plan)=>Object.values(room.plans||{}).filter(r=>r.message_id===message.id&&r.plan_hash===plan.hash).sort((a,b)=>a.approval.issued_at-b.approval.issued_at);
const agentFor=(ctx,run)=>ctx.agents.find(a=>a.id===run.agent_id);
const changed=(ctx,run)=>{try{ctx.save();}catch(e){ctx.room.notice=e.message;}if(ctx.current()===ctx.room)ctx.refresh();};

// ---------------------------------------------------------------------------
// Following a run

const watching=new Set(),sending=new Set(),applying=new Set();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
/** Poll plan-status every 2 s while the run is active (or once to fetch a diff after a reload), while its room is open. */
export function watch(run,ctx){
  const needs=()=>run.run_id&&!applying.has(run.approval.approval_id)&&(ACTIVE.has(run.status)||(run.status==='diff_ready'&&run.diff===undefined));
  if(watching.has(run.approval.approval_id)||!needs())return;
  watching.add(run.approval.approval_id);
  (async()=>{
    let misses=0;
    try{
      while(needs()&&ctx.current()===ctx.room){
        const agent=agentFor(ctx,run);
        if(!agent){setState(run,'unreachable',{reason:'unreachable',detail:'The seat is no longer in your allowlist.'});changed(ctx,run);return;}
        try{
          const status=await fetchStatus({agent,run,plan:run.edit?.length?{edit:run.edit}:null,request:ctx.request});misses=0;run.unreachable='';
          if(applyStatus(run,status))changed(ctx,run);
          else{const line=document.querySelector(`[data-plan-progress="${run.approval.approval_id}"]`);if(line)line.textContent=run.progress||'Starting…';}
        }catch(e){
          if(e.code){setState(run,e.code,{reason:e.code,detail:e.detail||e.message});changed(ctx,run);return;}
          misses++;run.unreachable=e.message;if(misses===3)ctx.refresh();
        }
        if(needs())await sleep(Math.min(POLL_MS*(1+misses),10000));
      }
    }finally{watching.delete(run.approval.approval_id);}
  })();
}

// ---------------------------------------------------------------------------
// The owner's actions: approve and run, apply, discard

async function approveAndRun(message,plan,seat,ctx,opener){
  let id;try{id=await roomIdentity();}catch(e){ctx.room.notice=`Couldn’t load this browser’s room key: ${e.message}`;ctx.refresh();return;}
  const signed=await askApproval({plan,seat,room:ctx.room,requesterId:id.nodeId,approver:ctx.approver,fallback:()=>opener});
  if(!signed)return;
  const run=newRun({plan,seat,room:ctx.room,messageId:message.id,signed,approver:ctx.approver});run.edit=[...plan.edit];
  run.notes.push({at:Date.now(),text:summaryLine(run)});
  (ctx.room.plans??={})[run.approval.approval_id]=run;sending.add(run.approval.approval_id);changed(ctx,run);
  try{run.run_id=await sendRun({agent:agentFor(ctx,run),plan,signed,run,request:ctx.request});setState(run,'running');}
  catch(e){const code=e.code||'unreachable';setState(run,code,{reason:code,detail:e.detail||e.message});}
  finally{sending.delete(run.approval.approval_id);}
  changed(ctx,run);watch(run,ctx);
}

async function applyRun(run,ctx,opener){
  let id;try{id=await roomIdentity();}catch(e){ctx.room.notice=`Couldn’t load this browser’s room key: ${e.message}`;ctx.refresh();return;}
  const r=run.report,seat={label:run.seat,nodeId:run.seat_id};
  const plan={hash:run.plan_hash,code:run.code,title:run.title,project:run.project};
  const signed=await askApproval({kind:'apply',plan,seat,room:ctx.room,requesterId:id.nodeId,approver:ctx.approver,apply:{runId:run.run_id,diffHash:r.diff_hash,baseCommit:r.base_commit,files:r.files.map(f=>f.path)},fallback:()=>opener});
  if(!signed)return;
  const a=signed.approval;run.applies.push({approval_id:a.approval_id,issued_at:a.issued_at,expires_at:a.expires_at,passkey:ctx.approver.fingerprint,diff_hash:a.diff_hash,base_commit:a.base_commit});
  setState(run,'applying');applying.add(run.approval.approval_id);changed(ctx,run);
  try{Object.assign(run,await sendApply({agent:agentFor(ctx,run),run,signed,request:ctx.request}));setState(run,'applied');}
  catch(e){
    const code=e.code||'unreachable';
    if(['unknown_run','bad_report','bad_result'].includes(code))setState(run,code,{reason:code,detail:e.detail||e.message});
    else{run.status='diff_ready';run.reason='';run.detail=`Not applied: ${code==='unreachable'?e.message:explain(code)}`;run.notes.push({at:Date.now(),text:`Plan ${run.code} on ${run.seat}: not applied (${code}).`});}
  }
  finally{applying.delete(run.approval.approval_id);}
  changed(ctx,run);
}

async function discardRun(run,ctx){
  try{await sendDiscard({agent:agentFor(ctx,run),run,request:ctx.request});delete run.diff;setState(run,'discarded');}
  catch(e){run.detail=`Not discarded: ${e.code?explain(e.code):e.message}`;}
  changed(ctx,run);
}

// ---------------------------------------------------------------------------
// The card

function diffView(diff){
  const pre=el('pre','plan-diff');pre.setAttribute('aria-label','Diff');pre.tabIndex=0;
  for(const line of diff.split('\n')){const kind=line.startsWith('+++')||line.startsWith('---')?'file':line.startsWith('+')?'add':line.startsWith('-')?'del':line.startsWith('@@')?'hunk':line.startsWith('diff --git')?'file':'';pre.append(el('span',kind?`d-${kind}`:'',line+'\n'));}
  return pre;
}

function runSection(run,ctx){
  const box=el('div',`plan-run is-${isFailure(run.status)?'failed':run.status}`);
  box.append(el('p','plan-state',`${stateLabel(run.status)} · ${run.seat} (${run.seat_id}) · approved ${time(run.approval.issued_at)} with passkey ${run.approval.passkey}`));
  if(run.status==='running'||run.status==='sending'||run.status==='applying'){
    const line=el('p','plan-progress',run.progress||(run.status==='sending'?'Sending the approval to the seat…':'Starting…'));line.dataset.planProgress=run.approval.approval_id;line.setAttribute('aria-live','polite');box.append(line);
    if(run.unreachable)box.append(el('p','subtle',`Can’t reach the seat right now (${run.unreachable}). Still trying.`));
  }
  if(isFailure(run.status))box.append(el('p','plan-failed',`${explain(run.reason||run.status)}${run.detail?` (${run.detail})`:''}`));
  const r=run.report;
  if(r&&(run.status==='diff_ready'||run.status==='applying'||run.status==='applied')){
    if(r.summary){box.append(el('p','subtle','Claude Code’s summary (its own words)'),el('p','plan-summary',r.summary));}
    const files=el('ul','plan-files');files.append(...r.files.map(f=>{const li=el('li');li.append(el('code','',f.path),el('span','subtle',` +${f.added} −${f.removed}`));return li;}));
    box.append(el('p','subtle','Files changed'),files);
    if(r.denials.length)box.append(el('p','subtle',`Refused during the run: ${r.denials.join('; ')}`));
  }
  if(run.status==='diff_ready'){
    if(run.diff!==undefined){
      const details=el('details','plan-diff-box');details.open=true;
      details.append(el('summary','',r.diff_truncated?'Diff (the first 48,000 characters; the seat checks the whole diff by its hash)':`Diff · matches its signed hash ${r.diff_hash.slice(0,12)}`),diffView(run.diff));
      box.append(details);
    }else box.append(el('p','subtle','Fetching the diff from the seat…'));
    if(run.detail)box.append(el('p','plan-failed',run.detail));
    const actions=el('div','actions'),apply=button('Apply to branch…','primary'),discard=button('Discard');
    apply.disabled=run.diff===undefined||!ctx.approver;
    apply.onclick=()=>applyRun(run,ctx,apply);
    discard.onclick=()=>{if(!discard.dataset.confirm){discard.dataset.confirm='1';discard.textContent='Discard this diff? It can’t be undone';return;}discard.disabled=true;discardRun(run,ctx);};
    actions.append(apply,discard);box.append(actions);
    box.append(el('p','subtle',`Apply puts it on a new branch, eureka/plan-${run.code}, in ${run.project}. Your checkout and working tree aren’t touched. The diff waits on the seat for 24 hours.`));
  }
  if(run.status==='applied')box.append(el('p','plan-applied',`On branch ${run.branch} at commit ${run.commit.slice(0,12)} in ${run.project}. Review and merge it as you would any branch.`));
  return box;
}

/** What to show for the seats instead of a button, and which seats may get one. */
function seatChoice(seats,ctx){
  const ready=[],notes=[];
  for(const s of seats){
    const agent=ctx.agents.find(a=>a.id===s.id),known=knownOffer(s.id);
    if(known===undefined){notes.push(el('p','subtle',`Checking whether ${s.label} can run plans…`));seatOffersPlans(agent,{request:ctx.request}).then(()=>ctx.refresh(),()=>{});}
    else if(known==='yes')ready.push(s);
    else if(known==='no')notes.push(el('p','subtle',`${s.label} can’t run plans. That takes a Claude Code seat with a project, on eureka-daemon v0.3.0 or later, set up with this browser’s room key.`));
    else{const p=el('p','subtle',`Couldn’t ask ${s.label} whether it runs plans: ${known.unreachable} `),again=button('Check again');again.onclick=()=>{forgetOffer(s.id);ctx.refresh();};p.append(again);notes.push(p);}
  }
  return {ready,notes};
}

/**
 * The cards for one message. ctx: {room, agents, approver, current(), refresh(), save(), request?}. Everything from the
 * plan and from the seat goes in as text, never as Markdown, HTML or a link.
 */
export function planCards(message,ctx){
  const {room}=ctx;if(!isLeadMessage(message,room))return [];
  const found=plansIn(message.text,ctx.refresh);
  if(!found)return found===null&&planBlocks(message.text).length?[el('p','subtle plan-checking','Checking a plan…')]:[];
  return found.map(r=>{
    const card=el('section','plan-card');card.setAttribute('aria-label','Plan');
    if(r.error){card.classList.add('is-invalid');card.append(el('span','eyebrow','PLAN · NOT VALID'),el('p','',`This plan can’t be approved: ${r.error.detail} (${r.error.code}).`));return card;}
    const plan=r.plan,seats=seatsIn(room,ctx.agents),runs=runsFor(room,message,plan);
    const heading=el('div','plan-heading');heading.append(el('span','eyebrow',`PLAN · ${plan.code}`),el('h3','',plan.title));
    const steps=el('ol','plan-steps');steps.append(...plan.steps.map(s=>el('li','',s)));
    const files=el('ul','plan-files');files.append(...plan.edit.map(f=>{const li=el('li');li.append(el('code','',f));return li;}));
    card.append(heading,el('p','subtle',`Project ${plan.project}`),el('p','subtle','Steps'),steps,el('p','subtle','Files that may change'),files,el('p','plan-note',othersNote(room)));
    for(const run of runs){if(run.status==='sending'&&!sending.has(run.approval.approval_id))setState(run,'interrupted',{reason:'interrupted'});card.append(runSection(run,ctx));watch(run,ctx);}
    const busy=runs.some(x=>ACTIVE.has(x.status)||x.status==='diff_ready');
    const actions=el('div','actions');
    if(!seats.length)actions.append(el('p','subtle','No external agent in this room can run it. A Claude Code seat with a project can.'));
    else if(!busy){
      const {ready,notes}=seatChoice(seats,ctx);actions.append(...notes);
      if(ready.length&&!ctx.approver)actions.append(el('p','subtle','To approve plans, create a plan approval passkey in Connections → Advanced: bring your own bot.'));
      else if(ready.length){
        let pick=null;
        if(ready.length>1){pick=el('select');pick.setAttribute('aria-label','Seat to run the plan');pick.append(...ready.map(s=>new Option(`${s.label} (${s.nodeId})`,s.id)));actions.append(pick);}
        else actions.append(el('span','subtle',`Seat ${ready[0].label} (${ready[0].nodeId})`));
        const approve=button(runs.length?'Approve and run again…':'Approve plan…','primary');
        approve.onclick=()=>approveAndRun(message,plan,ready.find(s=>s.id===(pick?.value??ready[0].id)),ctx,approve);
        actions.append(approve);
      }
    }
    card.append(actions);return card;
  });
}

/** The transcript's system notes for a message's plans: the summary line of each state change, from signed results. */
export function planNotes(message,ctx){
  const notes=Object.values(ctx.room.plans||{}).filter(r=>r.message_id===message.id).flatMap(r=>r.notes).sort((a,b)=>a.at-b.at);
  return notes.map(n=>{
    const article=el('article','message system-note');article.dataset.initial='K';
    const by=el('small','agent-badge','From the seat’s signed result · not written by any member');
    article.append(el('strong','','Knights Circle'),by,el('p','',n.text));return article;
  });
}
