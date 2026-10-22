import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveRuntimeFilePath } from '../src/services/runtimeFilePath';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function makeDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'soccerpredict-runtime-path-'));
  temporaryDirectories.push(directory);
  return directory;
}

describe('runtime file path resolution', () => {
  it('uses the default when the setting is missing, blank or the legacy sentinel', () => {
    const fallback = path.join(process.cwd(), 'data', 'results-log.json');
    assert.equal(resolveRuntimeFilePath(undefined, fallback, 'RESULTS_LOG_PATH'), fallback);
    assert.equal(resolveRuntimeFilePath('  ', fallback, 'RESULTS_LOG_PATH'), fallback);
    assert.equal(resolveRuntimeFilePath('2001', fallback, 'RESULTS_LOG_PATH'), fallback);
  });

  it('turns an existing storage directory into a full file path', () => {
    const directory = makeDirectory();
    const fallback = path.join(process.cwd(), 'data', 'results-log.json');
    assert.equal(
      resolveRuntimeFilePath(directory, fallback, 'RESULTS_LOG_PATH'),
      path.join(directory, 'results-log.json'),
    );
  });

  it('keeps runtime files under data when the configured value is the project working directory', () => {
    const fallback = path.join(process.cwd(), 'data', 'cron-status.json');
    assert.equal(
      resolveRuntimeFilePath(process.cwd(), fallback, 'CRON_STATUS_PATH'),
      fallback,
    );
  });

  it('preserves a configured full file path', () => {
    const directory = makeDirectory();
    const configured = path.join(directory, 'cron-status.json');
    const fallback = path.join(process.cwd(), 'data', 'cron-status.json');
    assert.equal(resolveRuntimeFilePath(configured, fallback, 'CRON_STATUS_PATH'), configured);
  });
});
