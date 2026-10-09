import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResultsArrays } from '../src/services/resultsLogParser';

test('parses a normal results array', () => {
  assert.deepEqual(parseResultsArrays('[{\"id\":\"a\"},{\"id\":\"b\"}]'), [{ id: 'a' }, { id: 'b' }]);
});

test('recovers concatenated complete arrays without losing entries', () => {
  assert.deepEqual(parseResultsArrays('[{"id":"a"}]\n[{"id":"b"},{"id":"c"}]' as any), [
    { id: 'a' }, { id: 'b' }, { id: 'c' },
  ]);
});

test('handles nested arrays and bracket characters inside string values', () => {
  const source = '[{"id":"a","nested":[1,2],"note":"text ] and ["}][{"id":"b"}]';
  assert.deepEqual(parseResultsArrays(source), [
    { id: 'a', nested: [1, 2], note: 'text ] and [' },
    { id: 'b' },
  ]);
});

test('empty files are treated as empty ledgers', () => {
  assert.deepEqual(parseResultsArrays('  \n  '), []);
});

test('rejects malformed or truncated trailing data instead of silently returning partial history', () => {
  assert.throws(() => parseResultsArrays('[{"id":"a"}]not-json'), /Malformed results log/);
  assert.throws(() => parseResultsArrays('[{"id":"a"}][{"id":"b"}'), /Malformed results log/);
  assert.throws(() => parseResultsArrays('{"id":"a"}'), /JSON array/);
});
