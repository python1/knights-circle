export const providers = [
  {id:'openrouter',name:'OpenRouter',initial:'OR',description:'One connection, many model families',base:'https://openrouter.ai/api/v1'},
  {id:'openai',name:'OpenAI',initial:'O',description:'Connect your own API account',base:'https://api.openai.com/v1'},
  {id:'anthropic',name:'Anthropic',initial:'A',description:'Connect your own API account',base:'https://api.anthropic.com/v1'},
  {id:'xai',name:'xAI',initial:'X',description:'Connect your own API account',base:'https://api.x.ai/v1'},
  {id:'google',name:'Google',initial:'G',description:'Connect your own API account',base:'https://generativelanguage.googleapis.com/v1beta'},
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
export async function request(url,init,fetcher=fetch){
  let response;
  try{response=await fetcher(url,{...init,redirect:'error',credentials:'omit',referrerPolicy:'no-referrer'});}catch(e){if(e.name==='AbortError')throw e;throw new Error('Connection failed. Check network access, provider browser support, and local permissions.');}
  // Never surface provider error bodies: they may contain credentials or prompt data.
  if(!response.ok)throw Object.assign(new Error(`Provider returned HTTP ${response.status}. Check your key, account access, and quota.`),{status:response.status});
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
export async function listModels(id,key,signal,fetcher=fetch){
  const p=config(id,key);const result=[];let next='';
  for(let page=0;page<20;page++){
    const url=new URL(p.base+(id==='ollama'?'/api/tags':'/models'));
    if(next)url.searchParams.set(id==='anthropic'?'after_id':'pageToken',next);
    const data=await(await request(url.href,{headers:p.headers,signal},fetcher)).json();
    const rows=id==='ollama'?data.models:id==='google'?data.models:data.data;
    if(!Array.isArray(rows))throw new Error('Provider returned an unsupported model catalog.');
    result.push(...rows.filter(m=>id!=='google'||m.supportedGenerationMethods?.includes('generateContent')).map(m=>({id:id==='ollama'?m.name:id==='google'?m.name.replace(/^models\//,''):m.id,name:m.displayName||m.name||m.id,free:id==='ollama'||(id==='openrouter'&&freePricing(m.pricing)),...(id==='openrouter'&&m.supported_parameters?.includes('reasoning')?{reasoning:m.reasoning||{}}:{})})));
    next=id==='anthropic'&&data.has_more?data.last_id:data.nextPageToken;
    if(!next)break;
    if(page===19)throw new Error('Model catalog pagination limit reached.');
  }
  return result.sort((a,b)=>a.id.localeCompare(b.id));
}
export async function* records(body,ndjson=false){
  if(!body)throw new Error('Streaming is unavailable.');
  const reader=body.getReader(),decoder=new TextDecoder();let buffer='';
  try{while(true){const {done,value}=await reader.read();buffer+=decoder.decode(value,{stream:!done});
    if(buffer.length>2_000_000)throw new Error('Provider stream exceeded the safety limit.');
    let split;
    while((split=buffer.indexOf('\n'))>=0){let line=buffer.slice(0,split).replace(/\r$/,'');buffer=buffer.slice(split+1);
      if(!ndjson&&!line.startsWith('data:'))continue;
      if(!ndjson)line=line.slice(5).trim();
      if(!line||line==='[DONE]')continue;
      yield JSON.parse(line);
    }
    if(done){if(ndjson&&buffer.trim())yield JSON.parse(buffer);break;}
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
  const response=await request(p.base+path,{method:'POST',headers:p.headers,body:JSON.stringify(body),signal},fetcher);
  for await(const data of records(response.body,id==='ollama')){
    if(data.error||data.type==='error')throw new Error('Provider stopped the stream with an error.');
    const text=id==='anthropic'?data.delta?.text:id==='google'?data.candidates?.[0]?.content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join(''):id==='ollama'?data.message?.content:data.choices?.[0]?.delta?.content;
    const usage=id==='google'?data.usageMetadata:id==='ollama'&&data.done?{input_tokens:data.prompt_eval_count,output_tokens:data.eval_count}:data.usage||data.message?.usage;
    const reasoning=id==='ollama'?data.message?.thinking:id==='openrouter'?data.choices?.[0]?.delta?.reasoning:undefined;
    if(reasoning)yield {reasoning};if(text)yield {text};if(usage)yield {usage};
  }
}
