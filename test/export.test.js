import {test} from 'node:test';import assert from 'node:assert/strict';import {encodeShare,decodeShare,markdown,publicSnapshot} from '../src/export.js';
const room={name:'Room 🌿',objective:'Discuss',key:'secret',members:[{prompt:'private prompt'}],messages:[{speaker:'Critic',text:'Hello 🌍',status:'complete',at:1,key:'secret'}]};
test('read-only snapshot roundtrip preserves Unicode',()=>assert.deepEqual(decodeShare(encodeShare(room)),publicSnapshot(room)));
test('shared snapshot excludes keys and system prompts',()=>{const text=JSON.stringify(decodeShare(encodeShare(room)));assert.ok(!text.includes('secret'));assert.ok(!text.includes('private prompt'));});
test('oversized snapshots rejected',()=>assert.throws(()=>encodeShare({...room,objective:'x'.repeat(25000)}),/too large/));
test('invalid shared input rejected',()=>{assert.throws(()=>decodeShare('!!!'),/Invalid/);assert.throws(()=>decodeShare(btoa('{"version":2}')),/Invalid/);});
test('Markdown escapes HTML and link syntax',()=>{const output=markdown({...room,objective:'<script> [x](bad)'});assert.ok(output.includes('\\<script\\>'));assert.ok(output.includes('\\[x\\]'));assert.ok(output.includes('Created by Paul Charydczak'));});
