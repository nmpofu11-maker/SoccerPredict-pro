import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readCronStatus, getDefaultCronStatus } from '../src/services/cronStatusService';

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function makeFile(contents: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'soccerpredict-cron-'));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, 'cron-status.json');
  fs.writeFileSync(filePath, contents, 'utf-8');
  return filePath;
}

describe('cron status recovery', () => {
  it('reads a valid status snapshot', () => {
    const filePath = makeFile(JSON.stringify({
      ingest: { lastSuccess: true, fixturesIngested: 12 },
      settlement: { lastSuccess: true, resultsSettled: 4 },
    }));
    const status = readCronStatus(filePath);
    assert.equal(status.ingest.lastSuccess, true);
    assert.equal(status.ingest.fixturesIngested, 12);
    assert.equal(status.settlement.resultsSettled, 4);
  });

  it('recovers the latest complete snapshot from concatenated JSON objects', () => {
    const older = { ingest: { lastSuccess: false, fixturesIngested: 2 } };
    const latest = { ingest: { lastSuccess: true, fixturesIngested: 9 } };
    const filePath = makeFile(JSON.stringify(older) + JSON.stringify(latest));
    const status = readCronStatus(filePath);
    assert.equal(status.ingest.lastSuccess, true);
    assert.equal(status.ingest.fixturesIngested, 9);
    assert.deepEqual(status.settlement, getDefaultCronStatus().settlement);
  });

  it('returns safe defaults for truncated or unrecoverable JSON', () => {
    const filePath = makeFile('{"ingest":{"fixturesIngested":');
    const status = readCronStatus(filePath);
    assert.deepEqual(status, getDefaultCronStatus());
  });
});
