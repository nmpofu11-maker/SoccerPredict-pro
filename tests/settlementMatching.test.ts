import test from 'node:test';
import assert from 'node:assert/strict';
import { findSafeSettlementNameMatch, providerSettlementKickoffMs } from '../src/utils/settlementMatching';

const fixture = { kickoffTime: '2026-10-09T14:30:00.000Z' };

test('settlement fallback requires an explicit provider kickoff within three hours', () => {
  const good = { id: 'good', starting_at: '2026-10-09T15:00:00.000Z' };
  assert.equal(findSafeSettlementNameMatch([good], fixture), good);
  assert.equal(findSafeSettlementNameMatch([{ id: 'no-time' }], fixture), undefined);
  assert.equal(findSafeSettlementNameMatch([{ id: 'too-far', date: '2026-10-10T15:00:00.000Z' }], fixture), undefined);
});

test('settlement fallback refuses ambiguous same-team candidates', () => {
  const a = { id: 'a', date: '2026-10-09T14:30:00.000Z' };
  const b = { id: 'b', date: '2026-10-09T15:15:00.000Z' };
  assert.equal(findSafeSettlementNameMatch([a, b], fixture), undefined);
  assert.equal(findSafeSettlementNameMatch([], fixture), undefined);
});

test('provider kickoff extraction supports common provider field names', () => {
  assert.equal(providerSettlementKickoffMs({ commence_time: '2026-10-09T14:30:00Z' }), Date.parse('2026-10-09T14:30:00Z'));
  assert.equal(providerSettlementKickoffMs({ fixture: { date: '2026-10-09T14:30:00Z' } }), Date.parse('2026-10-09T14:30:00Z'));
  assert.ok(Number.isNaN(providerSettlementKickoffMs({ date: '2026-10-09' })));
});
