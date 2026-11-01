import test from 'node:test';import assert from 'node:assert/strict';import {follow,atBottom} from '../src/follow.js';
// A scrolling box: content height, visible height and position, firing scroll like a browser (smooth scrolls pass through positions).
function box({content=1000,height=300}={}){const b=new EventTarget();Object.assign(b,{scrollHeight:content,clientHeight:height,scrollTop:0,calls:[]});
  b.to=top=>{b.scrollTop=Math.max(0,Math.min(top,b.scrollHeight-b.clientHeight));b.dispatchEvent(new Event('scroll'));};
  b.scrollTo=({top,behavior})=>{b.calls.push(behavior);if(behavior==='smooth'){b.pending=top;b.to(b.scrollTop+(top-b.scrollTop)/2);}else b.to(top);};
  b.finish=()=>b.to(b.pending);b.grow=n=>{b.scrollHeight+=n;};return b;}
test('follows new text while it streams',()=>{const b=box(),f=follow(b);f.update();assert.ok(atBottom(b));for(let i=0;i<5;i++){b.grow(120);f.update();assert.ok(atBottom(b));}assert.ok(f.following);});
test('scrolling up stops following and shows Jump to latest; the reader is left in place as text arrives',()=>{const b=box(),seen=[],f=follow(b,{onChange:v=>seen.push(v)});f.update();
  b.to(200);assert.equal(f.following,false);assert.deepEqual(seen,[false]);b.grow(300);f.update();assert.equal(b.scrollTop,200);});
test('a small nudge near the bottom keeps following',()=>{const b=box(),f=follow(b);f.update();b.to(b.scrollTop-20);assert.ok(f.following);});
test('returning to the bottom resumes following',()=>{const b=box(),seen=[],f=follow(b,{onChange:v=>seen.push(v)});f.update();b.to(100);b.to(b.scrollHeight);assert.ok(f.following);assert.deepEqual(seen,[false,true]);b.grow(200);f.update();assert.ok(atBottom(b));});
test('Jump to latest scrolls smoothly back and follows, without its in-between positions stopping it',()=>{const b=box(),seen=[],f=follow(b,{onChange:v=>seen.push(v)});f.update();b.to(0);
  f.jump();assert.equal(b.calls.at(-1),'smooth');assert.ok(f.following);assert.ok(!atBottom(b),'halfway');b.finish();assert.ok(f.following&&atBottom(b));assert.deepEqual(seen,[false,true]);});
test('the reader taking over during a smooth jump wins',()=>{const b=box(),f=follow(b);f.update();b.to(0);f.jump();b.dispatchEvent(new Event('wheel'));b.to(50);assert.equal(f.following,false);});
test('reduced motion: Jump to latest is instant',()=>{const b=box(),f=follow(b,{reduceMotion:()=>true});f.update();b.to(0);f.jump();assert.equal(b.calls.at(-1),'auto');assert.ok(atBottom(b)&&f.following);});
test('following while streaming never scrolls smoothly',()=>{const b=box(),f=follow(b);for(let i=0;i<3;i++){b.grow(100);f.update();}assert.ok(b.calls.every(c=>c==='auto'));});
