import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import {
  createHistoricalArchiveBackup,
  ensureInitialHistoricalArchiveBackup,
  readHistoricalArchiveBackup,
  resolveHistoricalArchiveBackupPath,
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

test('backup lookup rejects path traversal and non-backup filenames', () => {
  const directory = makeDirectory();
  assert.equal(resolveHistoricalArchiveBackupPath(directory, '../historical-matches.json'), null);
  assert.equal(resolveHistoricalArchiveBackupPath(directory, 'some-other-file.json'), null);
});

test('restore reader validates the archive schema and match rows', () => {
  const directory = makeDirectory();
  const store = path.join(directory, 'historical-matches.json');
  const backupDirectory = path.join(directory, 'backups');
  fs.writeFileSync(store, JSON.stringify({
    version: 1,
    rows: [{ key: 'match-1', date: '2025-01-01', league: 'L', home: 'A', away: 'B', hg: 1, ag: 0 }],
  }));
  const backup = createHistoricalArchiveBackup(store, backupDirectory, new Date('2026-01-03T00:00:00.000Z'));
  assert.ok(backup);
  assert.equal(readHistoricalArchiveBackup(backupDirectory, backup.filename)?.[0].key, 'match-1');
  assert.equal(readHistoricalArchiveBackup(backupDirectory, '../historical-matches.json'), null);

  fs.writeFileSync(store, JSON.stringify({ version: 1, rows: [{}] }));
  const invalid = createHistoricalArchiveBackup(store, backupDirectory, new Date('2026-01-04T00:00:00.000Z'));
  assert.ok(invalid);
  assert.throws(() => readHistoricalArchiveBackup(backupDirectory, invalid.filename), /invalid match rows/i);
});

test('backup listing ignores unrelated JSON and temporary files', () => {
  const directory = makeDirectory();
  fs.mkdirSync(path.join(directory, 'backups'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'backups', 'notes.json'), '{"not":"a historical backup"}');
  fs.writeFileSync(path.join(directory, 'backups', 'historical-matches-2026-01-01T00-00-00-000Z-123.tmp'), 'incomplete');
  assert.deepEqual(listHistoricalArchiveBackups(path.join(directory, 'backups')), []);
});

test('startup creates a single initial snapshot for an existing archive', () => {
  const directory = makeDirectory();
  const store = path.join(directory, 'historical-matches.json');
  const backupDirectory = path.join(directory, 'backups');
  fs.writeFileSync(store, JSON.stringify({
    version: 1,
    rows: [{ key: 'match-1', date: '2025-01-01', league: 'L', home: 'A', away: 'B', hg: 1, ag: 0 }],
  }));

  const first = ensureInitialHistoricalArchiveBackup(store, backupDirectory, new Date('2026-03-01T00:00:00.000Z'));
  const second = ensureInitialHistoricalArchiveBackup(store, backupDirectory, new Date('2026-03-02T00:00:00.000Z'));
  assert.ok(first);
  assert.equal(second, null);
  assert.equal(listHistoricalArchiveBackups(backupDirectory).length, 1);
});

test('missing archive does not create a meaningless backup', () => {
  const directory = makeDirectory();
  const backupDirectory = path.join(directory, 'backups');
  assert.equal(createHistoricalArchiveBackup(path.join(directory, 'missing.json'), backupDirectory), null);
  assert.deepEqual(listHistoricalArchiveBackups(backupDirectory), []);
});

test('two snapshots created in the same millisecond never overwrite one another', () => {
  const directory = makeDirectory();
  const store = path.join(directory, 'historical-matches.json');
  const backupDirectory = path.join(directory, 'backups');
  const sameInstant = new Date('2026-04-01T12:00:00.000Z');

  fs.writeFileSync(store, JSON.stringify({ version: 1, rows: [{ key: 'before' }] }));
  const first = createHistoricalArchiveBackup(store, backupDirectory, sameInstant);
  fs.writeFileSync(store, JSON.stringify({ version: 1, rows: [{ key: 'after' }] }));
  const second = createHistoricalArchiveBackup(store, backupDirectory, sameInstant);

  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first.filename, second.filename);
  assert.equal(listHistoricalArchiveBackups(backupDirectory).length, 2);
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
