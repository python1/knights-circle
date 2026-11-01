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
