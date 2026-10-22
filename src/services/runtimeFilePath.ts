import fs from 'node:fs';
import path from 'node:path';

/**
 * Resolve a configured path used for a single runtime file.
 *
 * The environment variables in this app describe file paths, not directories.
 * In practice, local .env files sometimes contain the project/data directory by
 * mistake. Treat an existing directory as a storage directory instead of later
 * trying to read the directory as JSON or rename a temporary file onto it.
 *
 * If the supplied directory is the app's working directory, keep generated
 * runtime files under its data/ folder. For any other directory, place the
 * default file name directly inside that directory.
 */
export function resolveRuntimeFilePath(
  configuredValue: string | undefined | null,
  fallbackPath: string,
  envName: string,
): string {
  const configured = configuredValue?.trim();

  // "2001" was previously used as an invalid/sentinel value for two path settings.
  if (!configured || configured === '2001') return fallbackPath;

  try {
    const absoluteConfigured = path.resolve(configured);
    if (fs.existsSync(absoluteConfigured) && fs.statSync(absoluteConfigured).isDirectory()) {
      const targetDirectory = absoluteConfigured === path.resolve(process.cwd())
        ? path.join(absoluteConfigured, 'data')
        : absoluteConfigured;
      const resolvedPath = path.join(targetDirectory, path.basename(fallbackPath));
      console.warn(
        `[runtime-storage] ${envName} points to a directory, not a file. Using ${resolvedPath}; set ${envName} to a complete file path to override this.`,
      );
      return resolvedPath;
    }
  } catch {
    // Leave inaccessible or otherwise invalid values intact so the existing I/O
    // error handling reports the actual problem rather than silently relocating data.
  }

  return configured;
}
