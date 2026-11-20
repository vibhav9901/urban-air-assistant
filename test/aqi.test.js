import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandFor, buildPlan, cigaretteEquivalent } from '../lib/aqi.js';
import { validateRequest } from '../lib/validate.js';

const base = { health: [], commute: 'walk', home: [] };
const ids = (aqi, profile = base) => buildPlan({ aqi, pm25: 30, profile }).actions.map((a) => a.id);

test('bandFor respects EPA boundaries', () => {
  assert.equal(bandFor(50).label, 'Good');
  assert.equal(bandFor(51).label, 'Moderate');
  assert.equal(bandFor(301).label, 'Hazardous');
  assert.throws(() => bandFor(-1), RangeError);
  assert.throws(() => bandFor(NaN), RangeError);
});
test('cigaretteEquivalent is monotonic and safe for negatives', () => {
  assert.equal(cigaretteEquivalent(44), 2);
  assert.equal(cigaretteEquivalent(-5), 0);
});
test('clean air suggests enjoying it, no mask', () => {
  assert.deepEqual(ids(30), ['enjoy']);
});
test('unhealthy air + walking commute recommends mask and indoor exercise', () => {
  assert.ok(ids(180).includes('mask'));
  assert.ok(ids(180).includes('exercise'));
});
test('vulnerable members are prioritised first', () => {
  assert.equal(ids(160, { ...base, health: ['children'] })[0], 'protect-sensitive');
});
test('home factors drive purifier and cooking advice', () => {
  const r = ids(160, { ...base, home: ['no-purifier', 'gas-stove'] });
  assert.ok(r.includes('purifier') && r.includes('cooking'));
});
test('validateRequest accepts valid input and dedupes', () => {
  const r = validateRequest({ city: ' Ongole ', health: ['children', 'children'], commute: 'car', home: [] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.profile.health, ['children']);
  assert.equal(r.value.city, 'Ongole');
});
test('validateRequest rejects injection and unknown enums', () => {
  assert.equal(validateRequest({ city: '<script>alert(1)</script>' }).ok, false);
  assert.equal(validateRequest({ city: 'Delhi', health: ['__proto__'] }).ok, false);
  assert.equal(validateRequest({ city: 'Delhi', commute: 'teleport' }).ok, false);
  assert.equal(validateRequest(null).ok, false);
});
