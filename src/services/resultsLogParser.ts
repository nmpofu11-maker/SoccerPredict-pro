/**
 * Strictly recovers a sequence of complete JSON arrays from a results ledger.
 *
 * A single JSON array is the normal format. Some historical writes produced
 * concatenated complete arrays; those can be recovered safely. Any malformed,
 * partial, or non-array fragment throws so callers cannot mistake corrupt history
 * for an empty ledger and overwrite it.
 */
export function parseResultsArrays<T = unknown>(content: string): T[] {
  if (!content.trim()) return [];

  try {
    const parsed: unknown = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      throw new Error('results log must contain a JSON array');
    }
    return parsed as T[];
  } catch (error) {
    // If the whole document was valid JSON but had the wrong shape, do not
    // reinterpret it as a concatenated sequence.
    if (error instanceof Error && error.message === 'results log must contain a JSON array') {
      throw error;
    }
  }

  const recovered: T[] = [];
  let offset = 0;
  let arraysFound = 0;

  while (offset < content.length) {
    while (offset < content.length && /\s/.test(content[offset])) offset++;
    if (offset >= content.length) break;
    if (content[offset] !== '[') {
      throw new Error(`Malformed results log at character ${offset}: expected a complete JSON array`);
    }

    const start = offset;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let complete = false;

    for (; offset < content.length; offset++) {
      const char = content[offset];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === '[') {
        depth++;
      } else if (char === ']') {
        depth--;
        if (depth < 0) {
          throw new Error(`Malformed results log at character ${offset}: unexpected closing bracket`);
        }
        if (depth === 0) {
          offset++;
          complete = true;
          break;
        }
      }
    }

    if (!complete || inString || depth !== 0) {
      throw new Error(`Malformed results log: incomplete JSON array starting at character ${start}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content.slice(start, offset));
    } catch {
      throw new Error(`Malformed results log: invalid JSON array starting at character ${start}`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error(`Malformed results log: expected array starting at character ${start}`);
    }
    recovered.push(...(parsed as T[]));
    arraysFound++;
  }

  if (arraysFound === 0) {
    throw new Error('Malformed results log: no complete JSON arrays found');
  }
  return recovered;
}
