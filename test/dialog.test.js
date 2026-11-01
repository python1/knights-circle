import test from 'node:test';import assert from 'node:assert/strict';import {trapTarget} from '../src/dialog.js';
const [a,b,c]=['first','middle','last'];const items=[a,b,c];
test('Tab from the last control wraps to the first, and Shift+Tab from the first wraps to the last',()=>{assert.equal(trapTarget(items,c,false),a);assert.equal(trapTarget(items,a,true),c);});
test('Tab in the middle follows the normal order',()=>{assert.equal(trapTarget(items,a,false),null);assert.equal(trapTarget(items,b,true),null);});
test('focus that escaped the dialog is brought back inside',()=>{assert.equal(trapTarget(items,'outside',false),a);assert.equal(trapTarget(items,'outside',true),c);});
test('a dialog with nothing to focus traps nothing',()=>{assert.equal(trapTarget([],a,false),null);});
