// Minimal Markdown for model replies. Builds DOM nodes only (never innerHTML); raw HTML stays text, images become their alt text, and only http(s)/mailto links are linked.
const ITEM=/^( *)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/,FENCE=/^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)/,HEADING=/^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/,RULE=/^ {0,3}([-*_])([ \t]*\1){2,}[ \t]*$/,QUOTE=/^ {0,3}>/,SEPARATOR=/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/,SAFE=/^(https?:|mailto:)/i;
const indentOf=line=>line.match(/^ */)[0].length;
const cells=line=>line.trim().replace(/^\|/,'').replace(/(?<!\\)\|$/,'').split(/(?<!\\)\|/).map(c=>c.trim().replace(/\\\|/g,'|'));
const tableAt=(lines,i)=>lines[i].includes('|')&&i+1<lines.length&&lines[i+1].includes('|')&&SEPARATOR.test(lines[i+1]);
const startsBlock=(lines,i)=>FENCE.test(lines[i])||HEADING.test(lines[i])||RULE.test(lines[i])||QUOTE.test(lines[i])||ITEM.test(lines[i])||tableAt(lines,i);
export function parseInline(s){
  const out=[];let text='',i=0,m;
  const flush=()=>{if(text)out.push({type:'text',text});text='';};
  while(i<s.length){const rest=s.slice(i);
    if(s[i]==='\\'&&/[\\`*_~[\]()#>+\-.!|]/.test(s[i+1]||'')){text+=s[i+1];i+=2;continue;}
    if((m=rest.match(/^(`+)([\s\S]*?[^`])\1(?!`)/))){flush();out.push({type:'code',text:m[2].replace(/^ ([\s\S]*) $/,'$1')});}
    else if((m=rest.match(/^(\*\*|__)(?=\S)([\s\S]*?\S)\1/))&&(m[1]==='**'||!/\w/.test(s[i-1]||''))){flush();out.push({type:'strong',children:parseInline(m[2])});}
    else if((m=rest.match(/^~~(?=\S)([\s\S]*?\S)~~/))){flush();out.push({type:'del',children:parseInline(m[1])});}
    else if((m=rest.match(/^\*(?=[^\s*])([\s\S]*?[^\s*])\*(?!\*)/))||(!/\w/.test(s[i-1]||'')&&(m=rest.match(/^_(?=[^\s_])([\s\S]*?[^\s_])_(?!\w)/)))){flush();out.push({type:'em',children:parseInline(m[1])});}
    else if((m=rest.match(/^!?\[([^\]]*)\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)/))){flush();const children=parseInline(m[1]);out.push(rest[0]!=='!'&&SAFE.test(m[2])?{type:'link',href:m[2],children}:{type:'span',children});}
    else{text+=s[i++];continue;}
    i+=m[0].length;
  }
  flush();return out;
}
function list(lines,i){
  const first=lines[i].match(ITEM),base=first[1].length,ordered=/\d/.test(first[2]),node={type:'list',ordered,start:ordered?parseInt(first[2],10):1,items:[]};
  while(i<lines.length){const m=lines[i].match(ITEM);if(!m||m[1].length>=base+2||/\d/.test(m[2])!==ordered)break;
    const content=m[1].length+m[2].length+1,body=[m[3]];i++;
    while(i<lines.length){const line=lines[i];
      if(!line.trim()){let j=i;while(j<lines.length&&!lines[j].trim())j++;if(j<lines.length&&indentOf(lines[j])>=base+2){while(i<j){body.push('');i++;}continue;}break;}
      if(indentOf(line)>=base+2){body.push(line.slice(Math.min(indentOf(line),content)));i++;continue;}
      if(startsBlock(lines,i))break;
      body.push(line.trim());i++;
    }
    node.items.push({children:blocks(body)});
    let j=i;while(j<lines.length&&!lines[j].trim())j++;
    const next=j<lines.length&&lines[j].match(ITEM);if(next&&next[1].length<base+2&&/\d/.test(next[2])===ordered)i=j;else break;
  }
  return [node,i];
}
function blocks(lines){
  const out=[];let i=0,m;
  while(i<lines.length){const line=lines[i];
    if(!line.trim()){i++;continue;}
    if((m=line.match(FENCE))){const close=new RegExp(`^ {0,3}${m[1][0]==='`'?'`':'~'}{${m[1].length},}\\s*$`),body=[];i++;while(i<lines.length&&!close.test(lines[i]))body.push(lines[i++]);i++;out.push({type:'code',lang:m[2],text:body.join('\n')});continue;}
    if((m=line.match(HEADING))){out.push({type:'heading',level:m[1].length,children:parseInline(m[2])});i++;continue;}
    if(RULE.test(line)){out.push({type:'hr'});i++;continue;}
    if(QUOTE.test(line)){const body=[];while(i<lines.length&&QUOTE.test(lines[i]))body.push(lines[i++].replace(/^ {0,3}> ?/,''));out.push({type:'quote',children:blocks(body)});continue;}
    if(ITEM.test(line)){const [node,next]=list(lines,i);out.push(node);i=next;continue;}
    if(tableAt(lines,i)){const align=cells(lines[i+1]).map(c=>/^:-+:$/.test(c)?'center':/-:$/.test(c)?'right':/^:-/.test(c)?'left':'');const head=cells(lines[i]).map(parseInline),rows=[];i+=2;while(i<lines.length&&lines[i].trim()&&lines[i].includes('|'))rows.push(cells(lines[i++]).map(parseInline));out.push({type:'table',align,head,rows});continue;}
    const para=[lines[i++].trim()];while(i<lines.length&&lines[i].trim()&&!startsBlock(lines,i))para.push(lines[i++].trim());
    out.push({type:'paragraph',lines:para.map(parseInline)});
  }
  return out;
}
export function parseMarkdown(source){return blocks(String(source??'').replace(/\r\n?/g,'\n').split('\n').map(l=>l.replace(/^\t+/,t=>'    '.repeat(t.length))));}
function inline(doc,nodes){return nodes.map(n=>{
  if(n.type==='text')return doc.createTextNode(n.text);
  if(n.type==='code'){const e=doc.createElement('code');e.textContent=n.text;return e;}
  const e=doc.createElement({strong:'strong',em:'em',del:'del',link:'a',span:'span'}[n.type]);
  if(n.type==='link'){e.href=n.href;e.target='_blank';e.rel='noopener noreferrer nofollow';}
  e.append(...inline(doc,n.children));return e;});}
function block(doc,b){let e;
  if(b.type==='heading'){e=doc.createElement(`h${Math.min(b.level+2,6)}`);e.append(...inline(doc,b.children));}
  else if(b.type==='paragraph'){e=doc.createElement('p');b.lines.forEach((l,k)=>{if(k)e.append(doc.createElement('br'));e.append(...inline(doc,l));});}
  else if(b.type==='code'){e=doc.createElement('pre');const code=doc.createElement('code');code.textContent=b.text;e.append(code);}
  else if(b.type==='quote'){e=doc.createElement('blockquote');e.append(...b.children.map(c=>block(doc,c)));}
  else if(b.type==='hr')e=doc.createElement('hr');
  else if(b.type==='list'){e=doc.createElement(b.ordered?'ol':'ul');if(b.ordered&&b.start!==1)e.start=b.start;for(const item of b.items){const li=doc.createElement('li');li.append(...item.children.map(c=>block(doc,c)));e.append(li);}}
  else if(b.type==='table'){e=doc.createElement('table');const row=(tag,cols)=>{const tr=doc.createElement('tr');cols.forEach((c,k)=>{const td=doc.createElement(tag);if(b.align[k])td.style.textAlign=b.align[k];td.append(...inline(doc,c));tr.append(td);});return tr;};const thead=doc.createElement('thead'),tbody=doc.createElement('tbody');thead.append(row('th',b.head));tbody.append(...b.rows.map(r=>row('td',r)));e.append(thead,tbody);const wrap=doc.createElement('div');wrap.className='table-scroll';wrap.append(e);return wrap;}
  return e;}
export function renderMarkdown(target,source){target.replaceChildren(...parseMarkdown(source).map(b=>block(target.ownerDocument,b)));}
