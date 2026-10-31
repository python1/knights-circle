export const providers = [
  {id:'openrouter',name:'OpenRouter',initial:'OR',description:'One connection, many model families',base:'https://openrouter.ai/api/v1',keyUrl:'https://openrouter.ai/settings/keys'},
  {id:'openai',name:'OpenAI',initial:'O',description:'Connect your own API account',base:'https://api.openai.com/v1',keyUrl:'https://platform.openai.com/api-keys'},
  {id:'anthropic',name:'Anthropic',initial:'A',description:'Connect your own API account',base:'https://api.anthropic.com/v1',keyUrl:'https://platform.claude.com/settings/keys'},
  {id:'xai',name:'xAI',initial:'X',description:'Connect your own API account',base:'https://api.x.ai/v1',keyUrl:'https://console.x.ai/'},
  {id:'google',name:'Google',initial:'G',description:'Connect your own API account',base:'https://generativelanguage.googleapis.com/v1beta',keyUrl:'https://aistudio.google.com/app/apikey'},
  {id:'ollama',name:'Ollama',initial:'L',description:'Models running on this device',base:'http://127.0.0.1:11434'},
];
function config(id,key){
  const p=providers.find(p=>p.id===id);if(!p)throw new Error('Unknown provider.');
  if(id!=='ollama' && !key?.trim())throw new Error('Enter an API key first.');
  const headers={'Content-Type':'application/json'};
  if(id==='anthropic')Object.assign(headers,{'x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'});
  else if(id==='google')headers['x-goog-api-key']=key;
  else if(id!=='ollama')headers.Authorization=`Bearer ${key}`;
  return {...p,headers};
}
export const FREE_BUSY='This free model is busy or out of free requests. Try again later or pick another model.';
const httpReasons={400:'The provider rejected this request. Try another model or a lower output limit.',401:'The provider rejected this key. Check it and connect again.',402:'This account has no credit for this model. Pick a free model, or add credit with the provider.',403:'This key isn’t allowed to do this. Check the account’s access settings with the provider.',404:'This model or service isn’t available right now. Pick another model.',408:'The provider took too long to answer. Try again later.',413:'This request is too large for the model. Shorten the prompt or start a new room.',429:'The provider is limiting requests right now. Try again later or pick another model.'};
export function httpMessage(status){return `${httpReasons[status]||(status>=500?'The provider is having trouble right now. Try again later or pick another model.':'The provider returned an error.')} (HTTP ${status})`;}
export async function request(url,init,fetcher=fetch){
  let response;
  try{response=await fetcher(url,{...init,redirect:'error',credentials:'omit',referrerPolicy:'no-referrer'});}catch(e){if(e.name==='AbortError')throw e;throw new Error('Connection failed. Check network access, provider browser support, and local permissions.');}
  // Never surface provider error bodies: they may contain credentials or prompt data.
  if(!response.ok)throw Object.assign(new Error(httpMessage(response.status)),{status:response.status});
  return response;
}
// A refused origin and a stopped server both look like network errors to the page. A no-cors request still
// completes (with an unreadable response) while Ollama is running, which tells the two apart.
export async function probeOllama(fetcher=fetch){
  try{await fetcher(providers.find(p=>p.id==='ollama').base+'/api/version',{mode:'no-cors',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(5000)});return 'refused';}catch{return 'offline';}
}
// $0 only when every listed price is exactly zero and there are no conditional price overrides; routers' negative
// "variable" prices and anything unparseable count as paid.
export function freePricing(pricing){return !!pricing&&typeof pricing==='object'&&'prompt' in pricing&&'completion' in pricing&&Object.values(pricing).every(v=>Array.isArray(v)?v.length===0:(typeof v==='string'||typeof v==='number')&&String(v).trim()!==''&&Number(v)===0);}
// Models the app cannot hold a text conversation with: embeddings, speech, images, classifiers. Catalog data wins where a provider has it.
const nonChat=/embed|rerank|moderation|content-safety|guard|tts|whisper|transcri|speech|dall-e|image|imagine|imagen|veo|sora|lyria|realtime|^davinci|^babbage/i;
function chatModel(id,m){
  if(id==='openrouter'){const a=m.architecture||{};return (a.output_modalities||['text']).every(x=>x==='text')&&(a.input_modalities||['text']).includes('text')&&!/content-safety|guard|moderation|embed|rerank/i.test(m.id);}
  return id==='anthropic'||!nonChat.test(m.id||m.name||'');
}
export function modelLabel(m){return m.id+(m.free?' · free':'')+(m.chat===false?' · not a chat model':'');}
// Confirmed answering with visible text through this app (live check, 2026-10-30).
const verifiedFree=['nvidia/nemotron-3.5-super-vl:free'];
// Default pick: a model that already answered here, then a verified free chat model, then a free chat model that can answer without mandatory reasoning.
export function pickDefault(models,preferred=[]){
  return [...preferred,...verifiedFree].map(id=>models.find(m=>m.id===id&&m.chat!==false)).find(Boolean)
    ||models.find(m=>m.free&&m.chat!==false&&m.reasoning?.mandatory!==true&&m.id!=='openrouter/free')
    ||models.find(m=>m.free&&m.chat!==false)||models.find(m=>m.chat!==false)||models[0];
}
export async function listModels(id,key,signal,fetcher=fetch){
  const p=config(id,key);const result=[];let next='';
  for(let page=0;page<20;page++){
    const url=new URL(p.base+(id==='ollama'?'/api/tags':'/models'));
    if(next)url.searchParams.set(id==='anthropic'?'after_id':'pageToken',next);
    const data=await(await request(url.href,{headers:p.headers,signal},fetcher)).json();
    const rows=id==='ollama'?data.models:id==='google'?data.models:data.data;
    if(!Array.isArray(rows))throw new Error('Provider returned an unsupported model catalog.');
    result.push(...rows.filter(m=>id!=='google'||m.supportedGenerationMethods?.includes('generateContent')).map(m=>({id:id==='ollama'?m.name:id==='google'?m.name.replace(/^models\//,''):m.id,name:m.displayName||m.name||m.id,free:id==='ollama'||(id==='openrouter'&&freePricing(m.pricing)),chat:id==='ollama'||chatModel(id,m),...(id==='openrouter'&&m.supported_parameters?.includes('reasoning')?{reasoning:m.reasoning||{}}:{})})));
    next=id==='anthropic'&&data.has_more?data.last_id:data.nextPageToken;
    if(!next)break;
    if(page===19)throw new Error('Model catalog pagination limit reached.');
  }
  if(id==='ollama')await Promise.all(result.map(async m=>{
    // Embedding-only Ollama models lack the completion capability; unknown (older servers) counts as chat.
    try{const caps=(await(await request(p.base+'/api/show',{method:'POST',headers:p.headers,body:JSON.stringify({model:m.id}),signal},fetcher)).json()).capabilities;if(Array.isArray(caps))m.chat=caps.includes('completion');}
    catch(e){if(e.name==='AbortError'||e.name==='TimeoutError')throw e;}
  }));
  return result.sort((a,b)=>a.id.localeCompare(b.id));
}
export async function* records(body,ndjson=false){
  if(!body)throw new Error('Streaming is unavailable.');
  const reader=body.getReader(),decoder=new TextDecoder();let buffer='',data=[];
  function parseEvent(){const payload=data.join('\n');data=[];return payload==='[DONE]'?{__done:true}:JSON.parse(payload);}
  try{while(true){const {done,value}=await reader.read();buffer+=decoder.decode(value,{stream:!done});
    if(buffer.length+data.join('').length>2_000_000)throw new Error('Provider stream exceeded the safety limit.');
    let split;
    while((split=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,split).replace(/\r$/,'');buffer=buffer.slice(split+1);
      if(ndjson){if(line.trim())yield JSON.parse(line);continue;}
      if(!line){if(data.length)yield parseEvent();continue;}
      if(line.startsWith('data:'))data.push(line.slice(5).replace(/^ /,''));
    }
    if(done){if(ndjson&&buffer.trim())yield JSON.parse(buffer);else if(!ndjson){if(buffer.startsWith('data:'))data.push(buffer.slice(5).trim());if(data.length)yield parseEvent();}break;}
  }}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
async function ollamaThinks(p,model,signal,fetcher){
  // Only models that report the thinking capability accept think:false; older servers omit capabilities.
  try{return !!(await(await request(p.base+'/api/show',{method:'POST',headers:p.headers,body:JSON.stringify({model}),signal},fetcher)).json()).capabilities?.includes('thinking');}
  catch(e){if(e.name==='AbortError'||e.name==='TimeoutError')throw e;return false;}
}
// OpenRouter: turn reasoning off where the catalog says it is optional, otherwise ask for the lowest effort the model accepts.
// reasoning.exclude is not used: it still spends the tokens and only hides the reasoning.
export function reasoningControl(info){
  const r=info?.reasoning;if(!r)return undefined;
  if(r.mandatory===false)return {enabled:false};
  return {effort:Array.isArray(r.supported_efforts)?r.supported_efforts.filter(e=>e!=='none').at(-1)||'low':'low'};
}
export async function* generate({provider:id,key,model,messages,system='',signal,maxTokens=256,info},fetcher=fetch){
  if(!model)throw new Error('Choose a model.');
  const p=config(id,key);let path='/chat/completions',body={model,messages:[...(system?[{role:'system',content:system}]:[]),...messages],stream:true};
  if(id==='anthropic'){path='/messages';body={model,system,messages,max_tokens:maxTokens,stream:true};}
  else if(id==='google'){path=`/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;body={systemInstruction:{parts:[{text:system||'Respond helpfully.'}]},contents:messages.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]})),generationConfig:{maxOutputTokens:maxTokens}};}
  else if(id==='ollama'){path='/api/chat';body.options={num_predict:maxTokens};if(await ollamaThinks(p,model,signal,fetcher))body.think=false;}
  else {body[id==='openai'?'max_completion_tokens':'max_tokens']=maxTokens;body.stream_options={include_usage:true};if(id==='openrouter'){const reasoning=reasoningControl(info);if(reasoning)body.reasoning=reasoning;}}
  const free=!!info?.free&&id!=='ollama';let response,said=false;
  try{response=await request(p.base+path,{method:'POST',headers:p.headers,body:JSON.stringify(body),signal},fetcher);}catch(e){if(free&&e.status===429)throw Object.assign(new Error(FREE_BUSY),{status:429});throw e;}
  let terminal=false;
  for await(const data of records(response.body,id==='ollama')){
    if(data.__done||data.type==='message_stop'||data.done||data.choices?.some(c=>c.finish_reason)||data.candidates?.some(c=>c.finishReason))terminal=true;
    if(data.error||data.type==='error')throw new Error(free&&[data.error?.code,data.error?.status].includes(429)?FREE_BUSY:'The provider stopped this reply with an error. Try again or pick another model.');
    const text=id==='anthropic'?data.delta?.text:id==='google'?data.candidates?.[0]?.content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join(''):id==='ollama'?data.message?.content:data.choices?.[0]?.delta?.content;
    const usage=id==='google'?data.usageMetadata:id==='ollama'&&data.done?{input_tokens:data.prompt_eval_count,output_tokens:data.eval_count}:data.usage||data.message?.usage;
    const reasoning=id==='ollama'?data.message?.thinking:id==='openrouter'?data.choices?.[0]?.delta?.reasoning:undefined;
    if(reasoning||text)said=true;if(reasoning)yield {reasoning};if(text)yield {text};if(usage&&Object.values(usage).some(v=>v!==undefined))yield {usage};
  }
  if(free&&!said)throw new Error(FREE_BUSY);
  if(!terminal)throw new Error('The provider stream ended unexpectedly. Partial output may have been billed.');
}
