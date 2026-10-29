import {request} from './providers.js';
const storageKey='collaboration.oauth';
const encode=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export async function beginOAuth(){
  const verifier=encode(crypto.getRandomValues(new Uint8Array(32))),state=encode(crypto.getRandomValues(new Uint8Array(32)));
  const challenge=encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
  sessionStorage.setItem(storageKey,JSON.stringify({verifier,state,created:Date.now()}));
  const url=new URL('https://openrouter.ai/auth');
  url.search=new URLSearchParams({callback_url:location.origin+'/',code_challenge:challenge,code_challenge_method:'S256',state});
  location.assign(url);
}
export async function finishOAuth(){
  const params=new URLSearchParams(location.search);if(!params.has('code')&&!params.has('error'))return null;
  history.replaceState(null,'',location.pathname);
  const raw=sessionStorage.getItem(storageKey);sessionStorage.removeItem(storageKey);
  if(!raw)throw new Error('No pending sign-in. Please start again.');
  const pending=JSON.parse(raw);
  if(params.get('state')!==pending.state||Date.now()-pending.created>600000)throw new Error('Sign-in expired or could not be verified. Please start again.');
  if(params.has('error'))throw new Error('Sign-in was not completed.');
  const data=await(await request('https://openrouter.ai/api/v1/auth/keys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:params.get('code'),code_verifier:pending.verifier,code_challenge_method:'S256'})})).json();
  if(typeof data.key!=='string'||!data.key)throw new Error('Sign-in returned no key.');
  return data.key;
}
