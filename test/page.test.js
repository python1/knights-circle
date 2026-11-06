import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
const sidebar=html.slice(html.indexOf('<aside class="sidebar"'),html.indexOf('</aside>')),credit=html.match(/<p class="public-credit">.*?<\/p>/)[0];
const links=part=>[...part.matchAll(/<a href="([^"]+)"([^>]*)>([^<]+)<\/a>/g)].map(([,href,attrs,text])=>({href,attrs,text}));
test('the sidebar has no build list, only the credit with Source, License and Support links',()=>{
  assert.doesNotMatch(sidebar,/roadmap|BUILD|LIVE|NEXT|Second machine/);assert.doesNotMatch(css,/\.roadmap/);
  for(const part of [sidebar,credit]){assert.match(part,/Created by Paul Charydczak/);
    const found=links(part).filter(l=>/^https:\/\/(github\.com|buymeacoffee\.com)\//.test(l.href));
    assert.deepEqual(found.map(({href,text})=>({href,text})),[{href:'https://github.com/python1/knights-circle',text:'Source'},{href:'https://github.com/python1/knights-circle/blob/main/LICENSE',text:'License: AGPL-3.0'},{href:'https://buymeacoffee.com/python1',text:'Support'}]);
    for(const l of found)assert.match(l.attrs,/target="_blank" rel="noopener noreferrer"/);}
});
test('a quiet Support link and nothing that nags: no pop-up, banner or dialog asks for money',()=>{
  assert.equal((html.match(/buymeacoffee\.com/g)||[]).length,2,'only the two credit lines link to it');
  for(const file of ['src/app.js','src/room-ui.js','src/agents-ui.js','src/dialog.js'])assert.doesNotMatch(readFileSync(new URL('../'+file,import.meta.url),'utf8'),/buymeacoffee|support this project|donat/i,file);
});
test('the links show once at each width: sidebar on desktop, page credit on phones',()=>{
  assert.match(css,/\.public-credit \.credit-links\{display:none\}/);
  const phone=css.slice(css.indexOf('@media(max-width:700px)'));
  assert.match(phone.slice(0,phone.indexOf('}}')),/\.sidebar footer\{display:none\}\.public-credit \.credit-links\{display:block\}/);
});
test('the team editor is one fieldset with the lock reason and its way forward right before it, and Add to team is the primary button',()=>{
  const ui=readFileSync(new URL('../src/room-ui.js',import.meta.url),'utf8');
  const lock=ui.indexOf('<div id="team-lock"'),editor=ui.indexOf('<fieldset id="team-editor"'),end=ui.indexOf('</fieldset></section>',editor);
  assert.ok(lock>0&&editor>lock&&ui.slice(lock,editor).includes('<button id="copy-room">New room with this team</button>')&&ui.slice(lock,editor).endsWith('</div>'));
  const fields=ui.slice(editor,end);for(const id of ['member-model','room-free-only','agent-grants','member-role','role-name','role-prompt'])assert.ok(fields.includes(`id="${id}"`),id);
  assert.ok(fields.endsWith('<button id="add-member" class="primary">+ Add to team</button>'));
  assert.match(ui,/\$\('#team-editor'\)\.disabled=active\|\|locked;\$\('#team-lock'\)\.hidden=!locked;\$\('#add-member'\)\.classList\.toggle\('primary',!active&&!locked\)/);
  assert.doesNotMatch(ui,/listRooms\(\)\[0\]/,'the app must not reopen the last saved room on load');
});
test('every app module is served locally, built, and cached for offline use',()=>{
  const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8'),build=read('build.mjs'),sw=read('sw.js'),server=read('server.mjs');
  for(const file of readdirSync(new URL('../src/',import.meta.url)).filter(f=>f.endsWith('.js'))){assert.ok(build.includes(`'src/${file}'`),`build.mjs: ${file}`);assert.ok(sw.includes(`'/src/${file}'`),`sw.js: ${file}`);assert.ok(server.includes(`['/src/${file}',['src/${file}',`),`server.mjs: ${file}`);}
});
test('counts shown to people use the right singular or plural',()=>{
  const ui=readFileSync(new URL('../src/room-ui.js',import.meta.url),'utf8'),app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(ui,/\$\{count\(saved\.messages\.length,'message'\)\}/);assert.match(ui,/\$\{count\(room\.turnCap,'turn'\)\}/);assert.match(app,/plural\(memoryState\.records,'record'\)/);assert.match(app,/plural\(models\.length,'model'\)/);
  for(const [name,text] of [['room-ui.js',ui],['app.js',app]])assert.doesNotMatch(text,/\$\{[^}]*(length|size|records)\}\s(messages|records|models|turns)\b/,name);
});
test('saved rooms each have a delete action, and there is a Delete all, confirmed in a dialog',()=>{
  const ui=readFileSync(new URL('../src/room-ui.js',import.meta.url),'utf8');
  assert.match(ui,/<dialog id="delete-dialog"[^>]*>.*<button id="delete-confirm" value="delete" class="danger"><\/button><button value="stay" autofocus>Cancel<\/button>/);
  assert.match(ui,/<button id="delete-all-rooms" class="delete-all" hidden>Delete all saved rooms<\/button>/);
  assert.match(ui,/setAttribute\('aria-label',`Delete saved room “\$\{saved\.name\}”`\)/);assert.match(ui,/This can’t be undone\./);
});
test('rounded chat look: messages, text fields and saved-room pills are rounded; buttons and panels keep their cut corners',()=>{
  const block=css.slice(css.indexOf('/* Rounded chat look'));
  for(const rule of [/\.message\{border-radius:var\(--round\)/,/input:not\(\[type=checkbox\]\):not\(\[type=file\]\),textarea,select\{border-radius:var\(--round-s\)\}/,/#redirect\{border-radius:var\(--round\)\}/,/\.saved-room>button:first-child\{border-radius:999px 0 0 999px/,/#saved-rooms \.saved-delete\{border-radius:0 999px 999px 0/])assert.match(block,rule);
  assert.match(css,/^button\{[^}]*clip-path:polygon/m);assert.match(css,/\.room-config,\.conversation,\.round-table,\.saved-toolbar[^{]*\{[^}]*clip-path:polygon/);
  assert.doesNotMatch(block,/(^|\})button\{|\.conversation\{|\.room-config\{|dialog\{/);
});
test('warm room: each member has one readable colour on seat and avatar, the speaker glows, and motion is gentle and optional',()=>{
  const ui=readFileSync(new URL('../src/room-ui.js',import.meta.url),'utf8'),warm=css.slice(css.indexOf('/* Warm room'));
  const tones=[...ui.match(/const modelTones=(\[[^\]]+\]),agentTones=(\[[^\]]+\])/).slice(1)].flatMap(list=>JSON.parse(list.replace(/'/g,'"')));
  assert.ok(tones.length>=8&&new Set(tones).size===tones.length);assert.ok(!tones.includes('#34d399'),'green stays yours');
  // The same toneFor() colours the seat and the message, so a member reads the same in both places.
  assert.match(ui,/seat\.style\.setProperty\('--tone',toneFor\(m\)\)/);assert.match(ui,/article\.classList\.add\('has-tone'\);article\.style\.setProperty\('--tone',toneFor\(member\)\)/);
  const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)),lum=c=>{const [r,g,b]=c.map(x=>{x/=255;return x<=.03928?x/12.92:((x+.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*b},ratio=(a,b)=>{const [x,y]=[lum(a),lum(b)];return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
  const panel=rgb('#0f1729'),surface=rgb('#131c31'),ink=rgb('#0b1020'),mix=(t,p)=>t.map((v,i)=>v*.12+p[i]*.88);
  for(const tone of tones){const t=rgb(tone);assert.ok(ratio(t,mix(t,panel))>=4.5,`${tone} on its tinted chip`);assert.ok(ratio(ink,t)>=4.5,`speaking ink on ${tone}`);assert.ok(ratio(t,surface)>=4.5,`${tone} speaking name`);}
  assert.match(warm,/\.seat-model \.seat-chip,\.seat-agent \.seat-chip,\.message\.has-tone:before\{border-color:var\(--tone\);color:var\(--tone\);background:color-mix\(in srgb,var\(--tone\) 12%,var\(--panel\)\)\}/);
  assert.match(warm,/\.seat\.speaking \.seat-chip,\.message\.has-tone\.is-speaking:before\{background:var\(--tone\)/);assert.match(warm,/\.message\.has-tone\.is-speaking\{border-color:var\(--tone\)/);
  // Only opacity and transform animate (cheap), and reduced motion stops them; the global rule does not reach pseudo-elements.
  for(const [,frames] of warm.matchAll(/@keyframes [\w-]+\{((?:[^{}]*\{[^}]*\})+)\}/g))assert.doesNotMatch(frames.replace(/(opacity|transform):[^;}]+;?/g,''),/:/);
  assert.match(warm,/@media\(prefers-reduced-motion:reduce\)\{\.round-table:has\(\.table-live\.live\):before,\.seat\.speaking:before\{animation:none\}\}/);
  // The first members of a team are clearly distinct: neighbouring tones in each list are far apart in perceived colour (CIE Lab distance; amber and coral were only 28).
  const lab=h=>{const [r,g,b]=rgb(h).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}),f=v=>v>.008856?Math.cbrt(v):7.787*v+16/116,[x,y,z]=[(r*.4124+g*.3576+b*.1805)/.95047,r*.2126+g*.7152+b*.0722,(r*.0193+g*.1192+b*.9505)/1.08883].map(f);return [116*y-16,500*(x-y),200*(y-z)];};
  for(const list of ui.match(/const modelTones=(\[[^\]]+\]),agentTones=(\[[^\]]+\])/).slice(1).map(l=>JSON.parse(l.replace(/'/g,'"'))))for(let i=1;i<list.length;i++){const [a,b]=[lab(list[i-1]),lab(list[i])];assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])>=35,`${list[i-1]} and ${list[i]} look alike`);}
  // Seats keep their cut corners from main.
  assert.match(css,/^\.seat-chip\{[^}]*clip-path:polygon/m);assert.doesNotMatch(css,/\.seat-chip\{clip-path:none/);
  assert.match(ui,/<div class="empty-room"><span>✳<\/span><h2>A little structure\.<br>A lot of possibility\.<\/h2><p>Pull up a chair:/);
});
test('the transcript follows new text, with Jump to latest, and fits the window',()=>{
  const ui=readFileSync(new URL('../src/room-ui.js',import.meta.url),'utf8');
  assert.match(ui,/<\/div><button type="button" id="jump-latest" class="jump-latest" hidden>↓ Jump to latest<\/button><form id="redirect-form">/);
  assert.match(ui,/follow\(\$\('#transcript'\),\{onChange:on=>\{\$\('#jump-latest'\)\.hidden=on;\},reduceMotion:\(\)=>matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches\}\)/);
  assert.match(ui,/\$\('#jump-latest'\)\.addEventListener\('wheel',e=>\{e\.preventDefault\(\);const box=\$\('#transcript'\);box\.scrollBy\(/,'a wheel over the button scrolls the transcript');
  assert.match(ui,/follower\.update\(\);vmRender\(\);saveState\(\);\}/,'every render keeps up when following');
  assert.equal(ui.match(/follower\.jump\(false\)/g).length,3,'opening a room, a new room and your own message go to the latest');
  assert.match(css,/#transcript\{min-height:min\(360px,45dvh\);max-height:min\(680px,62dvh\)/);assert.match(css,/\.jump-latest\{[^}]*margin:-56px auto 12px/);
});
test('Start is disabled with its reason and a way forward, re-checked on returning to Rooms',()=>{
  const ui=readFileSync(new URL('../src/room-ui.js',import.meta.url),'utf8');
  assert.match(ui,/id="start-room" class="primary" aria-describedby="start-reason-text">Start conversation<\/button><button id="pause-room" disabled>Pause<\/button><\/div><\/div><p id="start-reason" class="start-reason" hidden><span id="start-reason-text"><\/span> <button type="button" id="start-fix" class="link-button"><\/button><\/p>/);
  assert.match(ui,/\$\('#start-room'\)\.disabled=active\|\|!!blocked;\$\('#start-reason'\)\.hidden=!blocked;/);
  assert.match(ui,/if\(rooms\)\{refreshModels\(\);render\(\);\}/);
  assert.match(ui,/\$\('#start-fix'\)\.onclick=\(\)=>\{if\(\$\('#start-fix'\)\.dataset\.fix==='member'\)\{\$\('#team-editor'\)\.scrollIntoView\(\{block:'center'\}\);\$\('#member-model'\)\.focus\(\);\}else\{setView\('connections'\);/);
});
test('every dialog is modal, labelled and described, and opened through openModal (focus kept inside and returned, Esc is the safe choice)',()=>{
  const ui=readFileSync(new URL('../src/room-ui.js',import.meta.url),'utf8'),app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  for(const id of ['leave','conflict','delete'])assert.match(ui,new RegExp(`<dialog id="${id}-dialog" class="leave-dialog" role="alertdialog" aria-modal="true" aria-labelledby="${id}-title" aria-describedby="${id}-text">`));
  assert.match(html,/<dialog id="connection-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-note">/);assert.match(html,/<p id="dialog-note" class="dialog-note">/);
  for(const file of readdirSync(new URL('../src/',import.meta.url)).filter(f=>f.endsWith('.js')&&f!=='dialog.js'))assert.doesNotMatch(readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),/\.showModal\(/,`${file} opens a dialog without openModal`);
  assert.equal(ui.match(/openModal\(dialog,\{fallback:/g).length,3);assert.match(app,/openModal\(dialog,\{cancelValue:'',fallback:/);
  const d=readFileSync(new URL('../src/dialog.js',import.meta.url),'utf8');assert.match(d,/cancelValue='stay'/);assert.match(d,/addEventListener\('cancel',onCancel\)/);assert.match(d,/target\.focus\(\)/);
});
test('muted text and placeholders are at least 4.5:1 on every surface, and a locked team editor keeps its labels and help readable',()=>{
  const token=n=>css.match(new RegExp(`--${n}:(#[0-9a-f]{6})`))[1],rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)),lum=c=>{const [r,g,b]=c.map(x=>{x/=255;return x<=.03928?x/12.92:((x+.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*b},ratio=(a,b)=>{const [x,y]=[lum(rgb(a)),lum(rgb(b))];return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
  const placeholder=css.match(/input::placeholder,textarea::placeholder\{color:(#[0-9a-f]{6})\}/)[1];
  for(const surface of ['bg','panel','surface','raise']){assert.ok(ratio(token('muted'),token(surface))>=4.5,`muted on ${surface}`);}
  assert.ok(ratio(placeholder,token('bg'))>=4.5,'placeholders sit on the field background');
  assert.doesNotMatch(css,/\.team-editor:disabled\{opacity:\.45\}/);assert.match(css,/\.team-editor:disabled :is\(label,legend,\.subtle\)\{color:var\(--muted\)\}/);
});
