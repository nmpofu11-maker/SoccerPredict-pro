import fs from 'node:fs';
import path from 'node:path';

export const HISTORICAL_ARCHIVE_BACKUP_LIMIT = 5;

export interface HistoricalArchiveBackupInfo {
  filename: string;
  sizeBytes: number;
  modifiedAt: string;
}

const BACKUP_FILENAME_PATTERN =
  /^historical-matches-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-\d+(?:-\d+)?\.json$/;

/**
 * Snapshot the current archive before it is replaced. The raw bytes are copied
 * unchanged so the backup remains useful even if the existing archive is damaged.
 * Failures are deliberately propagated: an existing archive must not be replaced
 * when its safety snapshot could not be created.
 */
export function createHistoricalArchiveBackup(
  sourcePath: string,
  backupDirectory: string,
  now: Date = new Date(),
  keep: number = HISTORICAL_ARCHIVE_BACKUP_LIMIT,
): HistoricalArchiveBackupInfo | null {
  if (!fs.existsSync(sourcePath)) return null;
  const sourceStat = fs.statSync(sourcePath);
  if (!sourceStat.isFile()) {
    throw new Error(`Historical archive path is not a file: ${sourcePath}`);
  }

  fs.mkdirSync(backupDirectory, { recursive: true });
  const content = fs.readFileSync(sourcePath);
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const stem = `historical-matches-${timestamp}-${process.pid}`;
  let filename = `${stem}.json`;
  let suffix = 1;
  while (fs.existsSync(path.join(backupDirectory, filename))) {
    filename = `${stem}-${suffix}.json`;
    suffix += 1;
  }

  const destination = path.join(backupDirectory, filename);
  const temporary = `${destination}.tmp`;
  try {
    fs.writeFileSync(temporary, content, { flag: 'wx' });
    fs.renameSync(temporary, destination);
  } catch (error) {
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch {}
    throw error;
  }

  const maxBackups = Number.isFinite(keep) ? Math.max(1, Math.floor(keep)) : HISTORICAL_ARCHIVE_BACKUP_LIMIT;
  const backups = listHistoricalArchiveBackups(backupDirectory);
  for (const oldBackup of backups.slice(maxBackups)) {
    fs.unlinkSync(path.join(backupDirectory, oldBackup.filename));
  }

  const stats = fs.statSync(destination);
  return {
    filename,
    sizeBytes: stats.size,
    modifiedAt: stats.mtime.toISOString(),
  };
}

/** Resolves only a filename produced by this service; rejects traversal and arbitrary files. */
export function resolveHistoricalArchiveBackupPath(
  backupDirectory: string,
  filename: string,
): string | null {
  if (path.basename(filename) !== filename || !BACKUP_FILENAME_PATTERN.test(filename)) return null;
  const candidate = path.join(backupDirectory, filename);
  try {
    return fs.statSync(candidate).isFile() ? candidate : null;
  } catch {
    return null;
  }
}

/** Lists only backups created by this service, newest first. */
export function listHistoricalArchiveBackups(
  backupDirectory: string,
): HistoricalArchiveBackupInfo[] {
  if (!fs.existsSync(backupDirectory)) return [];
  return fs.readdirSync(backupDirectory)
    .filter(filename => BACKUP_FILENAME_PATTERN.test(filename))
    .map(filename => {
      const fullPath = path.join(backupDirectory, filename);
      const stats = fs.statSync(fullPath);
      return { filename, sizeBytes: stats.size, modifiedAt: stats.mtime.toISOString(), isFile: stats.isFile() };
    })
    .filter(item => item.isFile)
    .map(({ filename, sizeBytes, modifiedAt }) => ({ filename, sizeBytes, modifiedAt }))
    .sort((a, b) => b.filename.localeCompare(a.filename));
}
