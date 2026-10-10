import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readResultsLogFile } from '../src/services/resultsLogStore';

function withTempFile(content: string | undefined, run: (filePath: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'soccer-results-log-'));
  const filePath = path.join(dir, 'results-log.json');
  try {
    if (content !== undefined) fs.writeFileSync(filePath, content, 'utf8');
    run(filePath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const validEntry = { id: 'fixture-1', homeScore: 2, awayScore: 1, actualOutcome: 'home', date: '2026-10-10' };

test('missing results log is an empty first-run ledger', () => {
  withTempFile(undefined, (filePath) => assert.deepEqual(readResultsLogFile(filePath), []));
});

test('reads valid empty-array and populated ledgers', () => {
  withTempFile('[]', (filePath) => assert.deepEqual(readResultsLogFile(filePath), []));
  withTempFile(JSON.stringify([validEntry]), (filePath) => assert.deepEqual(readResultsLogFile(filePath), [validEntry]));
});

test('rejects an existing empty or whitespace-only file without changing it', () => {
  for (const content of ['', '  \n  ']) {
    withTempFile(content, (filePath) => {
      assert.throws(() => readResultsLogFile(filePath), /empty.*protect existing history/i);
      assert.equal(fs.readFileSync(filePath, 'utf8'), content);
    });
  }
});

test('rejects truncated and invalid JSON without changing original content', () => {
  for (const content of ['[{"id":"fixture-1"}', '[{"id":"fixture-1"}]not-json', '{not-json']) {
    withTempFile(content, (filePath) => {
      assert.throws(() => readResultsLogFile(filePath), /malformed.*protect existing history/i);
      assert.equal(fs.readFileSync(filePath, 'utf8'), content);
    });
  }
});

test('rejects structurally invalid settlement entries', () => {
  withTempFile(JSON.stringify([{}]), (filePath) => {
    assert.throws(() => readResultsLogFile(filePath), /invalid settlement record.*protect existing history/i);
  });
});

test('propagates file I/O errors instead of converting them to an empty ledger', () => {
  withTempFile(JSON.stringify([validEntry]), (filePath) => {
    fs.rmSync(filePath);
    fs.mkdirSync(filePath);
    assert.throws(() => readResultsLogFile(filePath), /EISDIR|directory/i);
  });
});
