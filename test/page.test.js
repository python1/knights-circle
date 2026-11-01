import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
const sidebar=html.slice(html.indexOf('<aside class="sidebar"'),html.indexOf('</aside>')),credit=html.match(/<p class="public-credit">.*?<\/p>/)[0];
const links=part=>[...part.matchAll(/<a href="([^"]+)"([^>]*)>([^<]+)<\/a>/g)].map(([,href,attrs,text])=>({href,attrs,text}));
test('the sidebar has no build list, only the credit with Source and License links',()=>{
  assert.doesNotMatch(sidebar,/roadmap|BUILD|LIVE|NEXT|Second machine/);assert.doesNotMatch(css,/\.roadmap/);
  for(const part of [sidebar,credit]){assert.match(part,/Created by Paul Charydczak/);
    const found=links(part).filter(l=>l.href.startsWith('https://github.com/'));
    assert.deepEqual(found.map(({href,text})=>({href,text})),[{href:'https://github.com/python1/knights-circle',text:'Source'},{href:'https://github.com/python1/knights-circle/blob/main/LICENSE',text:'License: AGPL-3.0'}]);
    for(const l of found)assert.match(l.attrs,/target="_blank" rel="noopener noreferrer"/);}
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
test('one rounded look: no cut corners remain, and buttons, panels, dialogs, cards, tabs and seats are rounded',()=>{
  const start=css.indexOf('/* Rounded chat look'),rounded=css.slice(start),rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m=>({at:m.index,selectors:m[1].trim().split(',').map(x=>x.trim()),body:m[2]}));
  const cut=rules.filter(r=>/clip-path:polygon/.test(r.body)).flatMap(r=>r.selectors);assert.ok(cut.length>5);
  for(const selector of cut)assert.ok(rules.some(r=>r.at>start&&r.selectors.includes(selector)&&/clip-path:none/.test(r.body)),`cut corner left on ${selector}`);
  const radius=selector=>rules.some(r=>r.at>start&&r.selectors.includes(selector)&&/border-radius:/.test(r.body));
  for(const selector of ['button','.primary-link','.provider-card','.room-config','.conversation','.round-table','.saved-toolbar','dialog','nav a','.seat-chip','.orb','.message','.message:before','input:not([type=checkbox]):not([type=file])','#redirect','.saved-room>button:first-child','#saved-rooms .saved-delete'])assert.ok(radius(selector),`no rounding for ${selector}`);
  assert.match(rounded,/\.orb,\.seat-chip\{clip-path:none;border-radius:50%\}/);
  assert.doesNotMatch(rounded,/--(bg|panel|surface|raise|amber|amber-text|blue|green):/,'colours are unchanged');
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
  assert.match(warm,/@media\(prefers-reduced-motion:reduce\)\{\.round-table:has\(\.table-live\.live\):before,\.seat\.speaking \.seat-chip:after\{animation:none\}\}/);
  assert.match(ui,/<div class="empty-room"><span>✳<\/span><h2>A little structure\.<br>A lot of possibility\.<\/h2><p>Pull up a chair:/);
});
