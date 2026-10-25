import {test} from 'node:test';
import assert from 'node:assert/strict';
import {browserIdentity} from '../lib/game-browser.js';
test('Browser identity is stable only for a valid signed cookie',()=>{
 const first=browserIdentity('', 'test-key');
 assert.match(first.hash,/^[a-f0-9]{64}$/);
 assert.deepEqual(browserIdentity(first.value,'test-key'),first);
 assert.notEqual(browserIdentity(first.value+'x','test-key').hash,first.hash);
 assert.notEqual(browserIdentity(first.value,'other-key').hash,first.hash);
});
