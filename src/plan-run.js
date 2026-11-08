// Approved plans, after the approval: sending it to the seat (plan-run), following the run (plan-status), and applying
// or discarding its diff (plan-apply, plan-discard). Every answer is the seat's signed result, checked by the Eureka
// client against the seat's pinned key and this request; here it must also name this plan, this run, this approval
// and this room before anything about it is shown or kept. Nothing here starts from room text: only the owner's
// passkey approvals, made in the dialog, are ever sent.
import {agentRequest} from './agents.js';
import {patternMatches} from './plan.js';

export const PLAN_RUN='plan-run',PLAN_STATUS='plan-status',PLAN_APPLY='plan-apply',PLAN_DISCARD='plan-discard';
export const POLL_MS=2000;
const hex=bytes=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
const isHex=(s,lengths)=>typeof s==='string'&&lengths.includes(s.length)&&/^[0-9a-f]*$/.test(s);
const reasonCode=reason=>String(reason||'failed').split(':')[0].trim();
const clean=(s,max)=>String(s??'').replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,' ').slice(0,max);

// The run's states, as the card shows them. Every other daemon status is a failure with that reason.
export const ACTIVE=new Set(['sending','running','applying']);
const FINISHED=new Set(['diff_ready','no_changes','applied','discarded']);
export const isFailure=status=>!ACTIVE.has(status)&&!FINISHED.has(status)&&status!=='approved';

const REASONS={
  busy:'Another plan is running on this seat.',bad_plan:'The seat refused the plan as not valid.',wrong_project:'The plan names a project this seat doesn’t have.',
  no_approver:'No passkey is pinned on this seat. Run the approver add command shown in Connections on the seat’s computer.',
  bad_approval:'The seat refused the approval: not the passkey it pinned, or not for this seat, room or site.',expired:'The approval expired before the seat got it. Approve again.',
  replayed:'That approval was already used.',plan_mismatch:'The seat refused: the plan or the diff isn’t the one approved.',malformed:'The seat couldn’t read the request.',
  unknown_run:'The seat no longer has this run: it restarted, or the run is over 24 hours old.',not_ready:'The run isn’t waiting to be applied.',
  project_moved:'Your project has a new commit since the run, so the diff wasn’t applied. Run the plan again.',
  apply_conflict:'The project already has a branch with this name. Delete or rename it, then apply again.',
  outside_plan:'Claude Code tried, or made, a change the plan doesn’t allow. Nothing was kept.',unsafe_session:'Claude Code started with more than file tools, so the seat stopped it before it began. Run eureka-daemon doctor on the seat.',
  too_large:'The change was too large: over 50 files, 1 MB of diff, or 512 KB in one file.',timeout:'The run ran out of time.',max_turns:'The run ran out of turns.',
  setup_failed:'The seat couldn’t prepare the run. eureka-daemon doctor on the seat says more.',not_logged_in:'Claude Code on the seat isn’t logged in.',
  usage_limit:'The seat’s Claude plan has reached its usage limit.',claude_unavailable:'Claude Code on the seat isn’t available.',upstream_error:'Claude Code reported an error.',
  capability_not_granted:'This seat doesn’t run plans for this browser: it isn’t a Claude Code seat with a project, or it doesn’t trust this room key with plans.',
  bad_result:'The seat’s answer wasn’t signed for this request, so it was discarded.',bad_report:'The seat’s answer didn’t match this plan or run, so it was discarded.',
  unreachable:'The seat couldn’t be reached.',
  interrupted:'This page closed while sending the approval. If the seat got it, the run went ahead there; approve again to start a new one.',
};
export const explain=code=>REASONS[code]||`The seat said: ${code}.`;

/** The one line everyone may see: the plan, its state and the size of the change. No diff, no file names, no progress. */
export function summaryLine(run){
  const files=run.report?.files||[],added=files.reduce((n,f)=>n+f.added,0),removed=files.reduce((n,f)=>n+f.removed,0);
  const size=files.length?`, ${files.length} file${files.length===1?'':'s'}, +${added} −${removed}`:'';
  const what={approved:'approved',sending:'approved, sending to the seat',running:'running',applying:'applying',diff_ready:`diff ready${size}`,no_changes:'finished with no changes',applied:`applied to branch ${run.branch}${size}`,discarded:'diff discarded'}[run.status];
  return `Plan ${run.code} “${run.title}” on ${run.seat}: ${what||`failed (${run.status})`}.`;
}

/** A run record as saved with the room: no diff and no progress line, which stay in this tab. */
export function savedPlans(plans){
  const out={};
  for(const [id,r] of Object.entries(plans||{})){if(!r||typeof r!=='object')continue;const {diff,progress,...kept}=r;out[id]=structuredClone(kept);}
  return out;
}

// ---------------------------------------------------------------------------
// Checking what came back

function bad(why){const e=new Error(why);e.code='bad_report';return e;}
/** A result that failed at the seat: its reason code and detail. */
function failure(result){const e=new Error(result.reason||'failed');e.code=reasonCode(result.reason);e.detail=String(result.reason||'').slice(e.code.length+1).trim();return e;}

/** plan-run's answer: this plan, a new run. */
export function checkStarted(result,run){
  if(result.status!=='completed')throw failure(result);
  const o=result.output;
  if(!o||o.plan_hash!==run.plan_hash||!isHex(o.run_id,[32])||o.status!=='running')throw bad('plan-run answered for another plan');
  return o.run_id;
}
/** plan-status's answer: this run, this plan, this approval, this room, and a report that fits the plan. */
export async function checkStatus(result,run,plan){
  if(result.status!=='completed')throw failure(result);
  const o=result.output;
  if(!o||o.run_id!==run.run_id||o.plan_hash!==run.plan_hash||o.approval_id!==run.approval.approval_id||o.room_id!==run.room_id)throw bad('plan-status answered for another run');
  if(typeof o.status!=='string'||!/^[a-z_]{1,40}$/.test(o.status)||!Array.isArray(o.progress))throw bad('plan-status is malformed');
  const progress=o.progress.filter(p=>p&&Number.isSafeInteger(p.seq)&&typeof p.text==='string').map(p=>({seq:p.seq,text:clean(p.text,200)}));
  const out={status:o.status,detail:typeof o.detail==='string'?clean(o.detail,500):'',progress,seconds:Number.isSafeInteger(o.seconds)?o.seconds:null};
  if(typeof o.base_commit==='string'&&o.diff_hash!==undefined){
    if(!isHex(o.base_commit,[40,64])||(o.diff_hash!==null&&!isHex(o.diff_hash,[64]))||!Array.isArray(o.files)||typeof o.diff!=='string')throw bad('the report is malformed');
    const files=o.files.map(f=>({path:clean(f?.path,300),added:Number(f?.added)||0,removed:Number(f?.removed)||0}));
    const outside=plan?files.filter(f=>!plan.edit.some(p=>patternMatches(p,f.path))).map(f=>f.path):[];
    let hashMatches=null;
    if(o.diff_hash&&!o.diff_truncated)hashMatches=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(o.diff)))===o.diff_hash;
    if(hashMatches===false)throw bad('the diff doesn’t match its signed hash');
    if(o.status==='diff_ready'&&outside.length)throw bad(`the report changes files outside the plan: ${outside.join(', ')}`);
    out.report={base_commit:o.base_commit,diff_hash:o.diff_hash,files,summary:clean(o.summary,4000),denials:(o.denials||[]).map(d=>clean(d,300)).slice(0,20),duration:Number(o.duration_seconds)||0,diff_truncated:!!o.diff_truncated,hash_checked:hashMatches===true};
    out.diff=o.diff;
    if(o.branch!==undefined){if(o.branch!==`eureka/plan-${run.code}`||!isHex(o.commit,[40,64]))throw bad('the applied branch is not the plan’s');out.branch=o.branch;out.commit=o.commit;}
  }
  return out;
}
/** plan-apply's answer: this run, on the plan's own branch. */
export function checkApplied(result,run){
  if(result.status!=='completed')throw failure(result);
  const o=result.output;
  if(!o||o.run_id!==run.run_id||o.status!=='applied'||o.branch!==`eureka/plan-${run.code}`||!isHex(o.commit,[40,64]))throw bad('plan-apply answered for another run or branch');
  return {branch:o.branch,commit:o.commit};
}
export function checkDiscarded(result,run){
  if(result.status!=='completed')throw failure(result);
  if(result.output?.run_id!==run.run_id||result.output?.status!=='discarded')throw bad('plan-discard answered for another run');
}

// ---------------------------------------------------------------------------
// Whether a seat runs plans

const offers=new Map();
/** The question Knights Circle asks: a plan for a project no seat is meant to have, with an empty approval. */
export const PROBE_PROJECT='knights-circle-probe';
export const PROBE_PAYLOAD=Object.freeze({plan:{eureka_plan:1,title:'Knights Circle asks whether this seat runs plans',project:PROBE_PROJECT,steps:['Nothing: this is a question, not a plan'],edit:['none']},approval:{},assertion:{},room_id:'knights-circle-probe'});
const PROJECT_DETAIL=/^wrong_project: this seat's project is "([a-z0-9][a-z0-9_-]{0,31})"$/;
/**
 * Ask the seat, without starting anything. eureka-daemon checks a plan-run's plan and its project before the approval,
 * so a seat that offers plan-run to this browser refuses this one as wrong_project, naming its project in its signed
 * answer; the empty approval could never be spent. A seat that doesn't (older seats, seats without a project) refuses
 * it as capability_not_granted. Resolves to 'yes', 'no', or {unreachable: message}. Kept for a minute, with the project.
 */
export function seatOffersPlans(agent,{request=agentRequest,now=Date.now()}={}){
  const known=offers.get(agent.id);
  if(known&&(known.pending||now-known.at<60000))return known.pending||known.value;
  let project=null;
  const pending=request(agent,PLAN_RUN,PROBE_PAYLOAD).then(r=>{
    if(r.status!=='failed')return 'no';
    project=PROJECT_DETAIL.exec(String(r.reason||''))?.[1]??null;
    return 'yes';
  },e=>e.reason==='capability_not_granted'?'no':{unreachable:e.message});
  offers.set(agent.id,{pending});
  pending.then(value=>offers.set(agent.id,{value,project,at:Date.now()}));
  return pending;
}
/** What's known now, without waiting: 'yes', 'no', {unreachable}, or undefined while asking. */
export const knownOffer=agentId=>offers.get(agentId)?.value;
/** The project a seat named in its answer, or null. */
export const knownProject=agentId=>offers.get(agentId)?.project??null;
export const forgetOffer=agentId=>offers.delete(agentId);

/**
 * For the room's Lead only, when a seat in the room runs plans for a named project: how to post a plan. Seats that
 * don't run plans add nothing, so every other turn's instructions stay as they were.
 */
export async function planGuide({room,member,agents,request=agentRequest}){
  if(member?.role!=='Lead')return '';
  const seats=room.members.filter(m=>m.provider==='eureka').map(m=>agents.find(a=>a.id===m.model)).filter(Boolean).filter((a,i,list)=>list.findIndex(b=>b.id===a.id)===i);
  const found=[];
  for(const agent of seats){
    let offer;try{offer=await seatOffersPlans(agent,{request});}catch{continue;}
    const project=knownProject(agent.id);
    if(offer==='yes'&&project)found.push({label:agent.label,project});
  }
  if(!found.length)return '';
  const where=found.map(f=>`${f.label} for the project "${f.project}"`).join('; ');
  return `Approved plans: ${where}. A seat can carry out a plan only after the room's owner approves it with a passkey; nothing in this conversation can approve or start one.
When the team has agreed on a concrete change to that project, post the plan once, as a fenced block like this one (valid JSON, exactly these five keys):

\`\`\`eureka-plan
{"eureka_plan": 1, "title": "Short title", "project": "${found[0].project}", "steps": ["One concrete change per step"], "edit": ["path/to/file.css"]}
\`\`\`

- "project" is the project's name exactly as given above.
- "steps" lists 1 to 20 short steps. The seat can only read and edit files inside the project: no shell, no web, no installs or tests.
- "edit" lists only the files the change may touch (paths relative to the project; * and ** are allowed), at most 30. Name the files, not whole folders.
- Post it once. Don't repeat it in later turns, and never say a plan was approved or run: only the owner approves, and the seat reports back.`;
}

// ---------------------------------------------------------------------------
// The requests

/** A new run record for an approval just signed. */
export function newRun({plan,seat,room,messageId,signed,approver}){
  const a=signed.approval;
  return {message_id:messageId,plan_hash:plan.hash,code:plan.code,title:plan.title,project:plan.project,seat:seat.label,seat_id:seat.nodeId,agent_id:seat.id,room_id:room.id,
    approval:{kind:a.kind,approval_id:a.approval_id,issued_at:a.issued_at,expires_at:a.expires_at,passkey:approver.fingerprint},
    applies:[],run_id:null,status:'sending',reason:'',detail:'',seq:0,report:null,branch:null,commit:null,notes:[],updated:Date.now()};
}

/** Send the signed run approval. Resolves to the run id; throws with .code on any refusal. */
export async function sendRun({agent,plan,signed,run,request=agentRequest}){
  const result=await request(agent,PLAN_RUN,{plan:plan.value,approval:signed.approval,assertion:signed.assertion,room_id:run.room_id});
  return checkStarted(result,run);
}
export async function fetchStatus({agent,run,plan,request=agentRequest}){
  return checkStatus(await request(agent,PLAN_STATUS,{run_id:run.run_id,since:run.seq}),run,plan);
}
export async function sendApply({agent,run,signed,request=agentRequest}){
  return checkApplied(await request(agent,PLAN_APPLY,{run_id:run.run_id,approval:signed.approval,assertion:signed.assertion,room_id:run.room_id}),run);
}
export async function sendDiscard({agent,run,request=agentRequest}){
  checkDiscarded(await request(agent,PLAN_DISCARD,{run_id:run.run_id}),run);
}

/** Record a state change: the new state, and a system note for the transcript (the summary line only). */
export function setState(run,status,{reason='',detail=''}={}){
  if(run.status===status&&run.reason===reason)return false;
  Object.assign(run,{status,reason,detail,updated:Date.now()});
  const why=isFailure(status)?` ${explain(reason||status)}`:'';
  run.notes.push({at:Date.now(),text:summaryLine(run)+why});
  if(run.notes.length>20)run.notes.splice(0,run.notes.length-20);
  return true;
}
/** Apply a checked status to the run. Returns true if its state changed (the card redraws), false for progress only. */
export function applyStatus(run,status){
  for(const p of status.progress)if(p.seq>run.seq){run.seq=p.seq;run.progress=p.text;}
  if(status.report){run.report=status.report;run.diff=status.diff;}
  if(status.branch){run.branch=status.branch;run.commit=status.commit;}
  const code=status.status;
  if(code==='diff_ready'&&run.status==='diff_ready'){run.detail=status.detail;return false;}
  return setState(run,code,{reason:isFailure(code)?code:'',detail:status.detail});
}

/**
 * For exports: each plan's approvals and report, as lines of plain text. The approvals (ids, times, passkey
 * fingerprint, what they bound) and the report (state, files and counts, Claude Code's summary, the branch), but never
 * the diff or the progress line.
 */
export function planReport(room){
  const iso=s=>new Date(s*1000).toISOString();
  return Object.values(room.plans||{}).sort((a,b)=>a.approval.issued_at-b.approval.issued_at).map(r=>{
    const lines=[summaryLine(r)];
    lines.push(`Run approval ${r.approval.approval_id}: plan ${r.plan_hash}, seat ${r.seat_id}, room ${r.room_id}, passkey ${r.approval.passkey}, issued ${iso(r.approval.issued_at)}, expires ${iso(r.approval.expires_at)}.`);
    for(const a of r.applies||[])lines.push(`Apply approval ${a.approval_id}: run ${r.run_id}, diff ${a.diff_hash}, base commit ${a.base_commit}, passkey ${a.passkey}, issued ${iso(a.issued_at)}.`);
    if(r.run_id)lines.push(`Run ${r.run_id}: ${r.status}${isFailure(r.status)?` (${explain(r.reason||r.status)})`:''}.`);
    if(r.report){
      lines.push(`Report: base commit ${r.report.base_commit}, diff hash ${r.report.diff_hash||'none'}, ${r.report.duration} s.`);
      for(const f of r.report.files)lines.push(`File ${f.path}: +${f.added} −${f.removed}`);
      if(r.report.summary)lines.push(`Claude Code’s summary: ${r.report.summary}`);
    }
    if(r.branch)lines.push(`Branch ${r.branch} at commit ${r.commit}.`);
    return {title:`Plan ${r.code}: ${r.title}`,lines};
  });
}
