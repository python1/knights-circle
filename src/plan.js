// Approved plans: the `eureka-plan` block a room's Lead may post, checked and hashed exactly as eureka-daemon checks and
// hashes it (eureka_protocol rust/src/plan.rs). The shared contract is test/fixtures/eureka/plans-v1.json. A plan here
// only ever becomes a card. Nothing runs from it: only the owner's passkey approval of its hash can start a run.
import {canonical} from './eureka-client.js';

export const PLAN_DOMAIN='eureka/plan/v1';
export const KEYS=['edit','eureka_plan','project','steps','title'];
export const LIMITS=Object.freeze({title:120,steps:20,step:1000,edit:30,pattern:200,project:32,plan:8000});
export const GIT_NAMES=['.git','.gitattributes','.gitmodules'];
const enc=new TextEncoder();
const hex=bytes=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');

/** A number with a fraction or exponent, kept apart from integers: Python reads `1.0` as a float, so the daemon refuses `"eureka_plan": 1.0`. */
export class PyFloat{constructor(text){this.text=text;}}

/**
 * JSON as Python's json.loads (and the daemon's reader) accepts it, keeping what JSON.parse loses: whether a number was
 * written as an integer. NaN and Infinity are read, raw control characters in strings are refused, duplicate keys keep
 * the last value, and a lone surrogate is refused (the daemon's reader can't hold one). Objects have no prototype.
 */
export function parseJson(text){
  let i=0;const fail=()=>{throw new SyntaxError(`not valid JSON at character ${i}`);};
  const ws=()=>{while(i<text.length&&' \t\n\r'.includes(text[i]))i++;};
  const starts=s=>text.startsWith(s,i);
  const hex4=()=>{const h=text.slice(i,i+4);if(!/^[0-9a-fA-F]{4}$/.test(h))fail();i+=4;return parseInt(h,16);};
  function string(){
    i++;let out='';
    for(;;){
      if(i>=text.length)fail();
      const c=text[i],code=text.charCodeAt(i);
      if(c==='"'){i++;return out;}
      if(c==='\\'){
        const e=text[i+1];i+=2;
        const simple={'"':'"','\\':'\\','/':'/',b:'\b',f:'\f',n:'\n',r:'\r',t:'\t'}[e];
        if(simple!==undefined){out+=simple;continue;}
        if(e!=='u')fail();
        let unit=hex4();
        if(unit>=0xd800&&unit<0xdc00&&starts('\\u')){const save=i;i+=2;const low=hex4();if(low>=0xdc00&&low<0xe000){out+=String.fromCharCode(unit,low);continue;}i=save;}
        if(unit>=0xd800&&unit<0xe000)fail();
        out+=String.fromCharCode(unit);continue;
      }
      if(code<0x20)fail();
      if(code>=0xd800&&code<0xdc00){const next=text.charCodeAt(i+1);if(!(next>=0xdc00&&next<0xe000))fail();out+=text.slice(i,i+2);i+=2;continue;}
      if(code>=0xdc00&&code<0xe000)fail();
      out+=c;i++;
    }
  }
  function value(depth){
    if(depth>500)fail();
    ws();const c=text[i];
    if(c==='{'){
      i++;const obj=Object.create(null);ws();
      if(text[i]==='}'){i++;return obj;}
      for(;;){ws();if(text[i]!=='"')fail();const key=string();ws();if(text[i]!==':')fail();i++;obj[key]=value(depth+1);ws();
        if(text[i]===','){i++;continue;}if(text[i]==='}'){i++;return obj;}fail();}
    }
    if(c==='['){
      i++;const list=[];ws();
      if(text[i]===']'){i++;return list;}
      for(;;){list.push(value(depth+1));ws();if(text[i]===','){i++;continue;}if(text[i]===']'){i++;return list;}fail();}
    }
    if(c==='"')return string();
    if(starts('true')){i+=4;return true;}
    if(starts('false')){i+=5;return false;}
    if(starts('null')){i+=4;return null;}
    if(starts('NaN')){i+=3;return new PyFloat('NaN');}
    if(starts('Infinity')){i+=8;return new PyFloat('Infinity');}
    if(starts('-Infinity')){i+=9;return new PyFloat('-Infinity');}
    const m=/^(-?(?:0|[1-9]\d*))(\.\d+)?([eE][-+]?\d+)?/.exec(text.slice(i));
    if(!m)fail();
    i+=m[0].length;
    if(m[2]||m[3])return new PyFloat(m[0]);
    const n=Number(m[1]);return Number.isSafeInteger(n)?(Object.is(n,-0)?0:n):BigInt(m[1]);
  }
  const out=value(0);ws();if(i!==text.length)fail();return out;
}

/** Characters a plan may never hold: control characters, line and paragraph separators, and bidirectional controls. */
export const hiddenChar=c=>/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/.test(c);
// Rust's str::trim (Unicode White_Space), which is not quite JavaScript's: U+FEFF isn't space there.
const blank=s=>/^[\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]*$/.test(s);
const length=s=>[...s].length;
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&!(v instanceof PyFloat);

export class PlanError extends Error{constructor(code,detail){super(detail);this.name='PlanError';this.code=code;}}
const refuse=(code,detail)=>{throw new PlanError(code,detail);};

function text(value,field,code,max){
  if(typeof value!=='string')refuse(code,`${field} must be text`);
  if(blank(value))refuse(code,`${field} is empty`);
  if(length(value)>max)refuse(code,`${field} is longer than ${max} characters`);
  if([...value].some(hiddenChar))refuse('bad_text',`${field} holds a control or direction character`);
  return value;
}
function list(value,field,code,max){
  if(!Array.isArray(value))refuse(code,`${field} must be a list`);
  if(!value.length||value.length>max)refuse(code,`${field} must list 1 to ${max} entries`);
  return value;
}

export const validProjectName=name=>typeof name==='string'&&/^[a-z0-9][a-z0-9_-]{0,31}$/.test(name);

/** One `edit` entry: a relative, /-separated path in which * and ? match within a segment and a ** segment any depth. Returns why not, or null. */
export function patternProblem(pattern){
  if(!pattern.length||enc.encode(pattern).length>LIMITS.pattern)return `a pattern must be 1 to ${LIMITS.pattern} characters`;
  if(pattern.startsWith('/')||pattern.startsWith('~'))return 'a pattern is relative to the project: no leading / or ~';
  const bad=[...pattern].find(c=>!/[A-Za-z0-9 ._\-+@=,*?/]/.test(c));
  if(bad!==undefined)return `a pattern may not hold ${JSON.stringify(bad)}`;
  let literal=false;
  for(const segment of pattern.split('/')){
    if(!segment)return 'a pattern may not have an empty segment (// or a trailing /)';
    if(segment==='.'||segment==='..')return 'a pattern may not hold . or .. segments';
    if(segment.includes('**')&&segment!=='**')return '** must be a whole segment';
    if(GIT_NAMES.includes(segment.toLowerCase()))return `a pattern may not name ${segment}`;
    if(segment.startsWith(' ')||segment.endsWith(' '))return 'a segment may not start or end with a space';
    literal||=/[^*?]/.test(segment);
  }
  return literal?null:'a pattern must name something: only wildcards would allow every file';
}
const segmentMatches=(p,n)=>!p.length?!n.length:p[0]==='*'?[...Array(n.length+1).keys()].some(k=>segmentMatches(p.slice(1),n.slice(k))):p[0]==='?'?n.length>0&&segmentMatches(p.slice(1),n.slice(1)):n[0]===p[0]&&segmentMatches(p.slice(1),n.slice(1));
function segmentsMatch(p,path){
  if(!p.length)return !path.length;
  if(p[0]==='**')return p.length===1?path.length>0:[...Array(path.length+1).keys()].some(k=>segmentsMatch(p.slice(1),path.slice(k)));
  return path.length>0&&segmentMatches(p[0],path[0])&&segmentsMatch(p.slice(1),path.slice(1));
}
/** Whether an `edit` pattern allows a path. Case-sensitive; a trailing ** is everything inside a folder, not the folder. */
export const patternMatches=(pattern,path)=>segmentsMatch(pattern.split('/'),path.split('/'));

/** The exact bytes hashed: the domain, NUL, the canonical plan. */
export function planBytes(value){const tag=enc.encode(PLAN_DOMAIN),body=enc.encode(canonical(value)),out=new Uint8Array(tag.length+1+body.length);out.set(tag);out.set(body,tag.length+1);return out;}
export async function planHash(value){return hex(await crypto.subtle.digest('SHA-256',planBytes(value)));}

/** Check a parsed plan. Unknown keys are refused, not ignored, so a plan can't carry anything its card doesn't show. Throws PlanError. */
export async function checkPlan(value){
  if(!isObject(value))refuse('not_a_plan','a plan is a JSON object');
  const unknown=Object.keys(value).find(k=>!KEYS.includes(k));
  if(unknown!==undefined)refuse('unknown_key',`a plan has no ${JSON.stringify(unknown)} field`);
  const missing=KEYS.find(k=>!(k in value));
  if(missing)refuse('missing_key',`the plan has no ${JSON.stringify(missing)} field`);
  if(value.eureka_plan!==1)refuse('bad_version','eureka_plan must be 1');
  const title=text(value.title,'title','bad_title',LIMITS.title);
  if(!validProjectName(value.project))refuse('bad_project','project must be the project’s name: lower-case letters, digits, - and _');
  const steps=list(value.steps,'steps','bad_steps',LIMITS.steps).map((s,n)=>text(s,`step ${n+1}`,'bad_steps',LIMITS.step));
  const edit=[];
  for(const pattern of list(value.edit,'edit','bad_edit',LIMITS.edit)){
    if(typeof pattern!=='string')refuse('bad_edit','each edit entry must be text');
    const why=patternProblem(pattern);if(why)refuse('bad_edit',`${JSON.stringify(pattern)}: ${why}`);
    if(edit.includes(pattern))refuse('bad_edit',`${JSON.stringify(pattern)} is listed twice`);
    edit.push(pattern);
  }
  if(length(canonical(value))>LIMITS.plan)refuse('too_long',`the plan is longer than ${LIMITS.plan} characters`);
  const hash=await planHash(value);
  return Object.freeze({value,title,project:value.project,steps,edit,hash,code:hash.slice(0,8)});
}

/** A plan from the text of its block. Resolves to {plan} or {error: {code, detail}}; never throws for bad input. */
export async function readPlan(json){
  let value;
  try{value=parseJson(json);}catch{return {error:{code:'not_json',detail:'the plan is not valid JSON'}};}
  try{return {plan:await checkPlan(value)};}catch(e){if(e instanceof PlanError)return {error:{code:e.code,detail:e.message}};throw e;}
}

/** The bodies of the ```eureka-plan blocks in a message, in order: fences of three or more backticks or tildes at the start of a line. */
export function planBlocks(message,max=5){
  const out=[],lines=String(message||'').split('\n');
  for(let n=0;n<lines.length&&out.length<max;n++){
    const open=/^(`{3,}|~{3,})eureka-plan[ \t]*$/.exec(lines[n].replace(/\r$/,''));
    if(!open)continue;
    const fence=open[1],body=[];let closed=false;
    for(n++;n<lines.length;n++){const line=lines[n].replace(/\r$/,'');if(line.startsWith(fence[0].repeat(fence.length))&&/^(`+|~+)[ \t]*$/.test(line)&&line.trim()[0]===fence[0]){closed=true;break;}body.push(line);}
    if(closed)out.push(body.join('\n'));
  }
  return out;
}
