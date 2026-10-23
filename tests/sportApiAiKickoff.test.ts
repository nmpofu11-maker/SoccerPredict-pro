import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSportApiAiKickoff } from '../src/utils/sportApiAiKickoff';

test('prefers the provider UTC kickoff over its Central European calendar time', () => {
  assert.equal(parseSportApiAiKickoff({
    kickoff_utc: '2026-10-22T00:30:00Z',
    datetime: '2026-10-22 02:30:00',
  }), '2026-10-22T00:30:00.000Z');
});

test('converts timezone-free provider datetime using CEST', () => {
  assert.equal(parseSportApiAiKickoff({ datetime: '2026-10-22 02:30:00' }), '2026-10-22T00:30:00.000Z');
});

test('converts timezone-free provider datetime using CET in winter', () => {
  assert.equal(parseSportApiAiKickoff({ datetime: '2026-01-15 02:30:00' }), '2026-01-15T01:30:00.000Z');
});

test('rejects date-only values and ambiguous unzoned non-datetime aliases', () => {
  assert.equal(parseSportApiAiKickoff({ date: '2026-10-22' }), null);
  assert.equal(parseSportApiAiKickoff({ kickoff_time: '2026-10-22 02:30:00' }), null);
});
