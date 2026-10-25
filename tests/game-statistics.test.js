import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parisDay, gameStatistics} from '../lib/game-statistics.js';
test('Counts days in Paris across the October clock change', () => {
  assert.equal(parisDay('2026-10-24T22:30:00Z'),'2026-10-25');
  assert.equal(parisDay('2026-10-26T23:00:00Z'),'2026-10-27');
});
test('Separates play, claim and redemption dates, fills empty days and filters periods', () => {
  const s=gameStatistics([{day:'2026-10-27',plays:5,wins:2},{day:'2026-10-29',plays:9,wins:1}], [{created_at:'2026-10-26T23:30:00Z',used_at:'2026-10-28T12:00:00Z',consent:true}], '2026-10-27','2026-10-28');
  assert.equal(s.days.length,2); assert.equal(s.plays,5); assert.equal(s.wins,2); assert.equal(s.claimed,1); assert.equal(s.used,1); assert.equal(s.newsletter,1); assert.equal(s.days[1].plays,0); assert.equal(s.days[0].used,0);
  assert.equal(gameStatistics([],[],'2026-10-28','2026-10-27').days.length,0);
});
