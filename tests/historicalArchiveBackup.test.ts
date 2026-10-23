import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import {
  createHistoricalArchiveBackup,
  HISTORICAL_ARCHIVE_BACKUP_LIMIT,
  listHistoricalArchiveBackups,
} from '../src/services/historicalArchiveBackup';

const temporaryDirectories: string[] = [];
function makeDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'soccerpredict-historical-backup-'));
  temporaryDirectories.push(directory);
  return directory;
}
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('historical archive backup is a byte-for-byte snapshot and is listed newest first', () => {
  const directory = makeDirectory();
  const store = path.join(directory, 'historical-matches.json');
  const backupDirectory = path.join(directory, 'backups');
  const original = Buffer.from('{ "version": 1, "rows": [{"key":"keep-me"}] }\n');
  fs.writeFileSync(store, original);

  const backup = createHistoricalArchiveBackup(store, backupDirectory, new Date('2026-01-01T00:00:00.000Z'));
  assert.ok(backup);
  assert.equal(fs.readFileSync(path.join(backupDirectory, backup.filename)).compare(original), 0);
  assert.equal(listHistoricalArchiveBackups(backupDirectory).length, 1);

  fs.writeFileSync(store, '{"version":1,"rows":[]}');
  createHistoricalArchiveBackup(store, backupDirectory, new Date('2026-01-02T00:00:00.000Z'));
  const backups = listHistoricalArchiveBackups(backupDirectory);
  assert.equal(backups.length, 2);
  assert.ok(backups[0].filename.includes('2026-01-02T00-00-00-000Z'));
  assert.ok(backups[1].filename.includes('2026-01-01T00-00-00-000Z'));
});

test('missing archive does not create a meaningless backup', () => {
  const directory = makeDirectory();
  const backupDirectory = path.join(directory, 'backups');
  assert.equal(createHistoricalArchiveBackup(path.join(directory, 'missing.json'), backupDirectory), null);
  assert.deepEqual(listHistoricalArchiveBackups(backupDirectory), []);
});

test('backup retention keeps no more than the configured count', () => {
  const directory = makeDirectory();
  const store = path.join(directory, 'historical-matches.json');
  const backupDirectory = path.join(directory, 'backups');

  for (let day = 1; day <= HISTORICAL_ARCHIVE_BACKUP_LIMIT + 2; day += 1) {
    fs.writeFileSync(store, JSON.stringify({ version: 1, rows: [{ day }] }));
    createHistoricalArchiveBackup(
      store,
      backupDirectory,
      new Date(`2026-02-${String(day).padStart(2, '0')}T00:00:00.000Z`),
      HISTORICAL_ARCHIVE_BACKUP_LIMIT,
    );
  }

  const backups = listHistoricalArchiveBackups(backupDirectory);
  assert.equal(backups.length, HISTORICAL_ARCHIVE_BACKUP_LIMIT);
  assert.ok(backups[0].filename.includes('2026-02-07T00-00-00-000Z'));
  assert.ok(backups.at(-1)?.filename.includes('2026-02-03T00-00-00-000Z'));
});
