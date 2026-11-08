// Plan cards and the approval dialog. A card shows a plan the room's Lead posted, exactly as hashed, as plain text. Its
// one button opens a dialog, and only Touch ID on the owner's plan approval passkey signs an approval. Room text never
// approves anything: a member writing "approved" or "go ahead" only adds text. Running a plan comes in the next update.
import {planBlocks,readPlan} from './plan.js';
import {makeApproval,signApproval,passkeyProblem,LIFETIME_SECONDS} from './passkey.js';
import {openModal} from './dialog.js';

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

// The approvals signed in this tab, kept for sending to the seat. They last 10 minutes, so they aren't saved.
const signed=new Map();
export const signedApproval=approvalId=>signed.get(approvalId);

let dialog=null;
function dialogElement(){
  if(dialog)return dialog;
  dialog=document.createElement('dialog');dialog.id='plan-dialog';dialog.className='leave-dialog plan-dialog';
  dialog.setAttribute('role','alertdialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','plan-dialog-title');dialog.setAttribute('aria-describedby','plan-dialog-text');
  dialog.innerHTML='<h2 id="plan-dialog-title"></h2><p id="plan-dialog-text"></p><dl id="plan-dialog-rows"></dl><p class="subtle">Files that may change</p><ul id="plan-dialog-files" class="plan-files"></ul><p id="plan-dialog-passkey" class="subtle"></p><p id="plan-dialog-status" role="status" aria-live="polite"></p><div class="actions"><button type="button" id="plan-dialog-approve" class="primary">Approve with passkey</button><button type="button" id="plan-dialog-cancel">Cancel</button></div>';
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
  const status=$('#plan-dialog-status'),approve=$('#plan-dialog-approve');status.textContent='';approve.disabled=false;
  approve.textContent=kind==='apply'?'Apply with passkey':'Approve with passkey';
  return new Promise(resolve=>{
    let controller=null,result=null;
    approve.onclick=async()=>{
      approve.disabled=true;status.textContent='Waiting for your passkey (Touch ID)…';controller=new AbortController();
      try{
        const approval=makeApproval({kind,planHash:plan.hash,seatId:seat.nodeId,requesterId,roomId:room.id,apply});
        const assertion=await signApproval(approval,approver,{signal:controller.signal});
        result={approval,assertion};signed.set(approval.approval_id,result);d.close('approved');
      }catch(e){if(d.open){status.textContent=passkeyProblem(e);approve.disabled=false;}}
    };
    $('#plan-dialog-cancel').onclick=()=>d.close('');
    d.addEventListener('close',()=>{controller?.abort();resolve(d.returnValue==='approved'?result:null);},{once:true});
    openModal(d,{cancelValue:'',fallback});
  });
}

/** The record kept on the message and in exports: who approved what, when. Not the signature. */
export function approvalRecord({approval},seat,approver){
  const {kind,plan_hash,seat_id,room_id,approval_id,issued_at,expires_at}=approval;
  return {kind,plan_hash,seat_id,seat:seat.label,room_id,approval_id,issued_at,expires_at,passkey:approver.fingerprint};
}

const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const time=s=>new Date(s*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});

/**
 * The cards for one message. ctx: {room, agents, approver, refresh, approve(plan, seat)}. Everything from the plan goes
 * in as text, never as Markdown, HTML or a link.
 */
export function planCards(message,ctx){
  const {room}=ctx;if(!isLeadMessage(message,room))return [];
  const found=plansIn(message.text,ctx.refresh);
  if(!found)return found===null&&planBlocks(message.text).length?[el('p','subtle plan-checking','Checking a plan…')]:[];
  return found.map(r=>{
    const card=el('section','plan-card');card.setAttribute('aria-label','Plan');
    if(r.error){card.classList.add('is-invalid');card.append(el('span','eyebrow','PLAN · NOT VALID'),el('p','',`This plan can’t be approved: ${r.error.detail} (${r.error.code}).`));return card;}
    const plan=r.plan,seats=seatsIn(room,ctx.agents);
    const heading=el('div','plan-heading');heading.append(el('span','eyebrow',`PLAN · ${plan.code}`),el('h3','',plan.title));
    const meta=el('p','subtle',`Project ${plan.project}`);
    const steps=el('ol','plan-steps');steps.append(...plan.steps.map(s=>el('li','',s)));
    const files=el('ul','plan-files');files.append(...plan.edit.map(f=>{const li=el('li');li.append(el('code','',f));return li;}));
    card.append(heading,meta,el('p','subtle','Steps'),steps,el('p','subtle','Files that may change'),files,el('p','plan-note',othersNote(room)));
    for(const a of (message.planApprovals||[]).filter(a=>a.plan_hash===plan.hash))card.append(el('p','plan-approved',`Approved for ${a.seat} (${a.seat_id}) with passkey ${a.passkey} at ${time(a.issued_at)}. Sending approved plans to a seat comes in the next update of Knights Circle; this approval expires at ${time(a.expires_at)}.`));
    const actions=el('div','actions');
    if(!seats.length)actions.append(el('p','subtle','No external agent in this room can run it. A Claude Code seat with a project can.'));
    else if(!ctx.approver)actions.append(el('p','subtle','To approve plans, create a plan approval passkey in Connections → Advanced: bring your own bot.'));
    else{
      let pick=null;
      if(seats.length>1){pick=el('select');pick.setAttribute('aria-label','Seat to run the plan');pick.append(...seats.map(s=>new Option(`${s.label} (${s.nodeId})`,s.id)));actions.append(pick);}
      else meta.textContent+=` · seat ${seats[0].label} (${seats[0].nodeId})`;
      const button=el('button','primary','Approve plan…');button.type='button';
      button.onclick=()=>ctx.approve(message,plan,seats.find(s=>s.id===(pick?.value??seats[0].id)),button);
      actions.append(button);
    }
    card.append(actions);return card;
  });
}
