import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {daemonDownloads,DAEMON_FILES} from '../src/agents-ui.js';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),ui=readFileSync(new URL('../src/agents-ui.js',import.meta.url),'utf8');
const panel=html.slice(html.indexOf('<section id="agents"'),html.indexOf('</section>',html.indexOf('<section id="agents"')));
const ua=userAgent=>({userAgent});
test('the download list narrows only on what the browser reliably reports',()=>{
  assert.deepEqual(daemonDownloads(ua('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36')),DAEMON_FILES.windows);
  // A Mac browser reports an Intel Mac even on Apple silicon, so both Mac files stay.
  assert.deepEqual(daemonDownloads(ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36')),DAEMON_FILES.mac);
  assert.deepEqual(daemonDownloads({userAgent:'Mozilla/5.0',userAgentData:{platform:'macOS',mobile:false}}),DAEMON_FILES.mac);
  assert.deepEqual(daemonDownloads(ua('Mozilla/5.0 (X11; Linux x86_64; rv:150.0) Gecko/20100101 Firefox/150.0')),['eureka-daemon-x86_64-unknown-linux-musl.tar.gz']);
  assert.deepEqual(daemonDownloads(ua('Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36')),['eureka-daemon-aarch64-unknown-linux-musl.tar.gz']);
  assert.deepEqual(daemonDownloads({userAgent:'Mozilla/5.0 (X11; Linux) Firefox/150.0'}),DAEMON_FILES.linux);
  for(const phone of ['Mozilla/5.0 (iPhone; CPU iPhone OS 26_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3 Mobile/15E148 Safari/604.1','Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36','Mozilla/5.0 (X11; CrOS x86_64 16000.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36'])
    assert.deepEqual(daemonDownloads(ua(phone)),[],phone);
  // An iPad asking for the desktop site says it's a Mac, but has a touch screen.
  assert.deepEqual(daemonDownloads({userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3 Safari/605.1.15',maxTouchPoints:5}),[]);
  assert.deepEqual(daemonDownloads({}),[]);
});
test('every download is listed in the page, linked at v0.1.0, so it works without scripts',()=>{
  for(const file of Object.values(DAEMON_FILES).flat())
    assert.ok(panel.includes(`<li data-file="${file}"><a href="https://github.com/python1/eureka_protocol/releases/download/v0.1.0/${file}" target="_blank" rel="noopener noreferrer">`),file);
  assert.ok(panel.includes('href="https://github.com/python1/eureka_protocol/releases/tag/v0.1.0"'));
});
test('bring your own bot is three plain steps, with the guides at v0.1.0 and no Python command',()=>{
  const steps=panel.slice(panel.indexOf('<ol class="byob-steps">'),panel.indexOf('</ol>'));
  const order=['Download eureka-daemon v0.1.0','Run <code>eureka-daemon setup</code>','id="show-room-key"','id="copy-room-key"','Paste what setup prints','Check'];
  let at=0;for(const part of order){const found=steps.indexOf(part,at);assert.ok(found>=at,part);at=found;}
  assert.equal((steps.match(/<li><strong>/g)||[]).length,3);
  for(const page of ['quickstart','grok-bot','openclaw','hermes','ollama'])
    assert.match(panel,new RegExp(`<a href="https://github.com/python1/eureka_protocol/blob/v0\\.1\\.0/docs/seat/${page}\\.md" target="_blank" rel="noopener noreferrer">`),page);
  assert.doesNotMatch(panel+ui,/venv|python -c|TrustList|trust-command|copy-trust/);
  assert.match(ui,/navigator\.clipboard\.writeText\(\$\('#room-key'\)\.value\)/);
});
test('it stays collapsed and optional, keeps the safety text, and says what the downloads are',()=>{
  assert.match(panel,/<button type="button" id="agents-toggle" class="agents-toggle" aria-expanded="false" aria-controls="agents-content"><span class="agents-label">Advanced: bring your own bot<\/span>/);
  assert.match(panel,/<div id="agents-content" hidden>/);assert.match(panel,/Optional · agents on this computer/);
  assert.match(panel,/Agents are untrusted\./);assert.match(panel,/Safari blocks agents on your computer: use Chrome, Edge or Firefox\./);
  assert.match(panel,/is a prototype, and its downloads aren’t signed by Apple or Microsoft/);
  assert.match(panel,/placeholder="http:\/\/127\.0\.0\.1:8766"/);
});
