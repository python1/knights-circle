// The plan approval passkey: a WebAuthn credential (Touch ID or another authenticator that verifies the user) that
// signs approvals of approved plans for eureka-daemon (eureka_protocol rust/src/approval.rs). It is not the room key:
// the room key signs every turn with no gesture, while this signs only when the owner approves, one approval each time.
// The daemon pins it at the seat's own terminal (`eureka-daemon approver add`), never over the network.
import {canonical} from './eureka-client.js';

export const APPROVAL_DOMAIN='eureka/plan/approval/v1';
export const DEFAULT_ORIGIN='https://knights-circle.vercel.app';
export const LIFETIME_SECONDS=600;
export const approverKey='knights-circle.plan-approver.v1';
// DER SubjectPublicKeyInfo header for an uncompressed P-256 key: the only key the daemon accepts.
const P256_SPKI_PREFIX='3059301306072a8648ce3d020106082a8648ce3d030107034200';
const FLAG_USER_PRESENT=0x01,FLAG_USER_VERIFIED=0x04;
const enc=new TextEncoder();
const hex=bytes=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
export const b64url=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export function unb64url(text){if(typeof text!=='string'||!/^[A-Za-z0-9_-]*$/.test(text)||text.length%4===1)throw new Error('not base64url');return Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-text.length%4)%4)),c=>c.charCodeAt(0));}
const sha256=async bytes=>new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
const isHex=(s,lengths)=>typeof s==='string'&&lengths.includes(s.length)&&/^[0-9a-f]*$/.test(s);
const isNode=s=>typeof s==='string'&&/^node_[0-9a-f]{8}$/.test(s);

/** What the owner compares with what `eureka-daemon approver add` prints: SHA-256 of the public key, 16 hex digits in fours. */
export async function fingerprint(publicKey){return hex(await sha256(unb64url(publicKey))).slice(0,16).match(/..../g).join(' ');}

/** The command to pin this passkey on a seat. --origin only when this isn't the public site (a local copy of Knights Circle). */
export function approverCommand(approver){return `eureka-daemon approver add ${approver.credentialId} ${approver.publicKey}${approver.origin===DEFAULT_ORIGIN?'':` --origin ${approver.origin}`}`;}

export function loadApprover(storage=globalThis.localStorage){
  try{const a=JSON.parse(storage.getItem(approverKey));return a&&typeof a.credentialId==='string'&&typeof a.publicKey==='string'&&typeof a.origin==='string'&&typeof a.fingerprint==='string'?a:null;}catch{return null;}
}
export const saveApprover=(approver,storage=globalThis.localStorage)=>storage.setItem(approverKey,JSON.stringify(approver));
export const forgetApprover=(storage=globalThis.localStorage)=>storage.removeItem(approverKey);

/** Why a passkey request failed, in words the owner can act on. */
export function passkeyProblem(e){
  if(e?.name==='NotAllowedError')return 'The passkey request was cancelled or timed out. Nothing was signed.';
  if(e?.name==='InvalidStateError')return 'This authenticator already holds a plan approval passkey for this site.';
  if(e?.name==='SecurityError')return 'This page can’t use passkeys here. Open Knights Circle over https (or on localhost).';
  if(e?.name==='NotSupportedError')return 'This browser or authenticator can’t make a P-256 passkey that verifies you (Touch ID, Windows Hello or a PIN).';
  return e?.message||String(e);
}

/**
 * Create the plan approval passkey. Only ES256 (P-256) is offered, and the user must be verified (Touch ID, not just a
 * tap). Returns what the owner pastes at the seat: the credential id and the public key (SPKI DER), both base64url.
 */
export async function createPasskey({credentials=globalThis.navigator?.credentials,rpId=globalThis.location?.hostname,origin=globalThis.location?.origin,existing=null,now=Date.now()}={}){
  if(!credentials?.create||!globalThis.PublicKeyCredential)throw new Error('This browser doesn’t support passkeys.');
  const credential=await credentials.create({publicKey:{
    rp:{id:rpId,name:'Knights Circle plan approvals'},
    user:{id:crypto.getRandomValues(new Uint8Array(16)),name:'Plan approvals',displayName:'Knights Circle plan approvals'},
    challenge:crypto.getRandomValues(new Uint8Array(32)),
    pubKeyCredParams:[{type:'public-key',alg:-7}],
    authenticatorSelection:{userVerification:'required',residentKey:'discouraged'},
    excludeCredentials:existing?[{type:'public-key',id:unb64url(existing.credentialId)}]:[],
    attestation:'none',timeout:120000,
  }});
  const response=credential?.response;
  if(!response?.getPublicKey)throw new Error('This browser doesn’t show a new passkey’s public key. Use a current Chrome, Edge, Safari or Firefox.');
  if(response.getPublicKeyAlgorithm&&response.getPublicKeyAlgorithm()!==-7)throw new Error('The authenticator made a key that isn’t P-256, which eureka-daemon can’t check.');
  const spki=new Uint8Array(response.getPublicKey()||[]);
  if(spki.length!==91||!hex(spki).startsWith(P256_SPKI_PREFIX+'04'))throw new Error('The authenticator made a key that isn’t P-256, which eureka-daemon can’t check.');
  const data=response.getAuthenticatorData?new Uint8Array(response.getAuthenticatorData()):null;
  if(data&&!(data[32]&FLAG_USER_VERIFIED))throw new Error('The authenticator didn’t verify you (no Touch ID, Windows Hello or PIN), and eureka-daemon requires it.');
  const publicKey=b64url(spki);
  return {credentialId:b64url(credential.rawId),publicKey,fingerprint:await fingerprint(publicKey),origin,created:new Date(now).toISOString()};
}

/**
 * The fields an approval signs. `run` approves a plan; `apply` approves one run's diff, naming the run, the diff's hash
 * and the commit it was made from. Valid for 10 minutes, once. Checked here as the daemon checks it, so a malformed
 * approval is never put in front of Touch ID.
 */
export function makeApproval({kind,planHash,seatId,requesterId,roomId,apply,now=Date.now()}){
  if(kind!=='run'&&kind!=='apply')throw new Error('an approval is for a run or an apply');
  if(!isHex(planHash,[64]))throw new Error('the plan hash must be 64 lower-case hex digits');
  if(!isNode(seatId)||!isNode(requesterId))throw new Error('the seat and the room key must be node ids');
  if(typeof roomId!=='string'||!/^[A-Za-z0-9-]{1,64}$/.test(roomId))throw new Error('the room id must be 1 to 64 letters, digits and -');
  const issued=Math.floor(now/1000);
  const approval={kind,plan_hash:planHash,seat_id:seatId,requester_id:requesterId,room_id:roomId,approval_id:hex(crypto.getRandomValues(new Uint8Array(16))),issued_at:issued,expires_at:issued+LIFETIME_SECONDS};
  if(kind==='apply'){
    if(!apply||!isHex(apply.runId,[32])||!isHex(apply.diffHash,[64])||!isHex(apply.baseCommit,[40,64]))throw new Error('an apply approval names the run, the diff hash and the base commit, in lower-case hex');
    Object.assign(approval,{run_id:apply.runId,diff_hash:apply.diffHash,base_commit:apply.baseCommit});
  }else if(apply)throw new Error('only an apply approval names a run');
  return approval;
}

/** The exact bytes the challenge hashes: the domain, NUL, the canonical approval. */
export function approvalBytes(approval){const tag=enc.encode(APPROVAL_DOMAIN),body=enc.encode(canonical(approval)),out=new Uint8Array(tag.length+1+body.length);out.set(tag);out.set(body,tag.length+1);return out;}
/** The WebAuthn challenge: SHA-256 over the approval's bytes. The passkey signs it with the browser's own client data. */
export const approvalChallenge=approval=>sha256(approvalBytes(approval));

/**
 * Ask for Touch ID on one approval, with the pinned passkey only. Checks what came back the way the daemon will (the
 * passkey, this site, the challenge, the user verified), so a refusal is caught here, then returns the assertion the
 * daemon takes: credential_id, authenticator_data, client_data_json and signature, base64url.
 */
export async function signApproval(approval,approver,{credentials=globalThis.navigator?.credentials,rpId=new URL(approver.origin).hostname,signal}={}){
  if(!credentials?.get)throw new Error('This browser doesn’t support passkeys.');
  const challenge=await approvalChallenge(approval);
  const credential=await credentials.get({signal,publicKey:{challenge,rpId,allowCredentials:[{type:'public-key',id:unb64url(approver.credentialId)}],userVerification:'required',timeout:120000}});
  const response=credential?.response;
  if(!response||b64url(credential.rawId)!==approver.credentialId)throw new Error('A passkey other than your plan approval passkey answered. Nothing was approved.');
  const data=new Uint8Array(response.authenticatorData),clientBytes=new Uint8Array(response.clientDataJSON);
  let client;try{client=JSON.parse(new TextDecoder().decode(clientBytes));}catch{throw new Error('The browser’s passkey answer couldn’t be read.');}
  if(client.type!=='webauthn.get'||client.challenge!==b64url(challenge)||client.origin!==approver.origin||client.crossOrigin===true)throw new Error('The passkey answer isn’t for this approval on this site. Nothing was approved.');
  if(data.length<37||hex(data.slice(0,32))!==hex(await sha256(enc.encode(rpId))))throw new Error('The passkey answer is for another site. Nothing was approved.');
  if(!(data[32]&FLAG_USER_PRESENT)||!(data[32]&FLAG_USER_VERIFIED))throw new Error('The authenticator didn’t verify you (Touch ID, Windows Hello or a PIN), so eureka-daemon would refuse this approval.');
  return {credential_id:b64url(credential.rawId),authenticator_data:b64url(data),client_data_json:b64url(clientBytes),signature:b64url(response.signature)};
}
