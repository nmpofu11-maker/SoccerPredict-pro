import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  readCronStatus,
  writeCronStatusAtomic,
  updateCronStatus,
  updateIngestCronStatus,
  updateSettlementCronStatus,
  getDefaultCronStatus,
  CronStatus,
} from '../src/services/cronStatusService';

function makeTempStatusFile(): { testFile: string; cleanup: () => void } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cron-status-test-'));
  const testFile = path.join(tmpDir, 'cron-status.json');
  return {
    testFile,
    cleanup: () => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    },
  };
}

test('Regression: reproduces the stale-snapshot overwrite bug when jobs hold full snapshots across async work', async () => {
  const { testFile, cleanup } = makeTempStatusFile();
  try {
    // 1. Initial status before any job runs
    writeCronStatusAtomic(getDefaultCronStatus(), testFile);
    assert.equal(readCronStatus(testFile).settlement.resultsSettled, 0);

    // 2. Long-running ingest job starts and reads an initial snapshot of status
    const staleIngestSnapshot = readCronStatus(testFile);

    // 3. While ingest is running (async network/parsing), settlement job runs and settles 15 matches
    const settlementTime = new Date('2026-10-09T10:00:00Z').toISOString();
    writeCronStatusAtomic({
      ...readCronStatus(testFile),
      settlement: {
        lastRunAt: settlementTime,
        lastSuccess: true,
        lastMessage: 'Settled 15 of 15 unsettled past fixtures.',
        resultsSettled: 15,
      },
    }, testFile);

    // Verify settlement status was written to disk
    const midStatus = readCronStatus(testFile);
    assert.equal(midStatus.settlement.resultsSettled, 15);
    assert.equal(midStatus.settlement.lastMessage, 'Settled 15 of 15 unsettled past fixtures.');

    // 4. Ingest job completes its async work and writes its stale snapshot with updated ingest
    staleIngestSnapshot.ingest = {
      lastRunAt: new Date('2026-10-09T10:00:05Z').toISOString(),
      lastSuccess: true,
      lastMessage: 'Ingested 25 fixtures from SportAPI.ai.',
      fixturesIngested: 25,
      sourceUsed: 'SPORTAPI_AI',
    };
    // The old buggy pattern writes the entire stale snapshot back to disk
    writeCronStatusAtomic(staleIngestSnapshot, testFile);

    // 5. Verification of the bug: settlement results were clobbered and lost!
    const clobberedStatus = readCronStatus(testFile);
    assert.equal(
      clobberedStatus.settlement.resultsSettled,
      0,
      'Bug confirmed: stale snapshot write wiped out settlement status'
    );
    assert.equal(
      clobberedStatus.settlement.lastMessage,
      'Not yet run',
      'Bug confirmed: settlement message was reverted to initial default'
    );
  } finally {
    cleanup();
  }
});

test('Fix: settlement status survives a concurrent ingestion update using safe partition updates', async () => {
  const { testFile, cleanup } = makeTempStatusFile();
  try {
    // 1. Initial status
    writeCronStatusAtomic(getDefaultCronStatus(), testFile);

    // 2. Ingestion job starts long-running async operation (does not hold a full snapshot)
    const ingestPromise = (async () => {
      // Simulate async network latency (e.g. calling external provider APIs)
      await new Promise((resolve) => setTimeout(resolve, 30));

      const ingestTime = new Date('2026-10-09T10:00:05Z').toISOString();
      return updateIngestCronStatus({
        lastRunAt: ingestTime,
        lastSuccess: true,
        lastMessage: 'Ingested 25 fixtures from SportAPI.ai.',
        fixturesIngested: 25,
        sourceUsed: 'SPORTAPI_AI',
      }, testFile);
    })();

    // 3. Fast settlement job finishes while ingestion is still in flight
    const settlementTime = new Date('2026-10-09T10:00:02Z').toISOString();
    updateSettlementCronStatus({
      lastRunAt: settlementTime,
      lastSuccess: true,
      lastMessage: 'Settled 15 of 15 unsettled past fixtures.',
      resultsSettled: 15,
    }, testFile);

    // Verify settlement is saved on disk immediately
    const intermediateStatus = readCronStatus(testFile);
    assert.equal(intermediateStatus.settlement.resultsSettled, 15);
    assert.equal(intermediateStatus.settlement.lastRunAt, settlementTime);

    // 4. Ingestion job finishes and writes its status
    await ingestPromise;

    // 5. Verify that settlement status survived completely intact!
    const finalStatus = readCronStatus(testFile);
    assert.equal(
      finalStatus.settlement.resultsSettled,
      15,
      'Settlement count must survive concurrent ingestion update'
    );
    assert.equal(
      finalStatus.settlement.lastMessage,
      'Settled 15 of 15 unsettled past fixtures.',
      'Settlement message must survive concurrent ingestion update'
    );
    assert.equal(
      finalStatus.settlement.lastRunAt,
      settlementTime,
      'Settlement timestamp must be preserved'
    );
    assert.equal(
      finalStatus.settlement.lastSuccess,
      true,
      'Settlement success flag must be preserved'
    );

    // And verify ingestion status was also properly written
    assert.equal(
      finalStatus.ingest.fixturesIngested,
      25,
      'Ingestion count must be recorded accurately'
    );
    assert.equal(
      finalStatus.ingest.sourceUsed,
      'SPORTAPI_AI',
      'Ingestion source must be recorded accurately'
    );
    assert.equal(
      finalStatus.ingest.lastMessage,
      'Ingested 25 fixtures from SportAPI.ai.',
      'Ingestion message must be recorded accurately'
    );
  } finally {
    cleanup();
  }
});

test('Fix: ingestion status survives a concurrent settlement update', async () => {
  const { testFile, cleanup } = makeTempStatusFile();
  try {
    writeCronStatusAtomic(getDefaultCronStatus(), testFile);

    // 1. Settlement job starts long-running async operation
    const settlementPromise = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));

      return updateSettlementCronStatus({
        lastRunAt: new Date('2026-10-09T11:00:05Z').toISOString(),
        lastSuccess: true,
        lastMessage: 'Settled 8 fixtures.',
        resultsSettled: 8,
      }, testFile);
    })();

    // 2. Ingestion job finishes first
    const ingestTime = new Date('2026-10-09T11:00:01Z').toISOString();
    updateIngestCronStatus({
      lastRunAt: ingestTime,
      lastSuccess: true,
      lastMessage: 'Ingested 18 fixtures.',
      fixturesIngested: 18,
      sourceUsed: 'THERUNDOWN',
    }, testFile);

    // 3. Settlement job finishes later
    await settlementPromise;

    // 4. Verify both partitions are intact
    const finalStatus = readCronStatus(testFile);
    assert.equal(finalStatus.ingest.fixturesIngested, 18);
    assert.equal(finalStatus.ingest.lastRunAt, ingestTime);
    assert.equal(finalStatus.ingest.sourceUsed, 'THERUNDOWN');
    assert.equal(finalStatus.settlement.resultsSettled, 8);
    assert.equal(finalStatus.settlement.lastMessage, 'Settled 8 fixtures.');
  } finally {
    cleanup();
  }
});

test('Concurrency stress: rapid interleaved partition updates preserve both domains without corruption', async () => {
  const { testFile, cleanup } = makeTempStatusFile();
  try {
    writeCronStatusAtomic(getDefaultCronStatus(), testFile);

    const totalOps = 40;
    const promises: Promise<void>[] = [];

    for (let i = 0; i < totalOps; i++) {
      const idx = i;
      promises.push(
        (async () => {
          // slight jitter
          await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 15)));
          if (idx % 2 === 0) {
            updateIngestCronStatus((prev) => ({
              ...prev,
              fixturesIngested: idx,
              lastMessage: `Ingest update #${idx}`,
              lastRunAt: new Date(1700000000000 + idx * 1000).toISOString(),
            }), testFile);
          } else {
            updateSettlementCronStatus((prev) => ({
              ...prev,
              resultsSettled: idx,
              lastMessage: `Settlement update #${idx}`,
              lastRunAt: new Date(1700000000000 + idx * 1000).toISOString(),
            }), testFile);
          }
        })()
      );
    }

    await Promise.all(promises);

    const finalStatus = readCronStatus(testFile);
    assert(finalStatus.ingest.fixturesIngested >= 0);
    assert(finalStatus.settlement.resultsSettled >= 0);
    assert.match(finalStatus.ingest.lastMessage, /Ingest update/);
    assert.match(finalStatus.settlement.lastMessage, /Settlement update/);

    // Verify file content is clean valid JSON
    const raw = fs.readFileSync(testFile, 'utf-8');
    const parsed = JSON.parse(raw);
    assert.equal(typeof parsed.ingest, 'object');
    assert.equal(typeof parsed.settlement, 'object');
  } finally {
    cleanup();
  }
});
