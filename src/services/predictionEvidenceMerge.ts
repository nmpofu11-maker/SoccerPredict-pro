export function mergeEvidenceFallbackFixtures<T extends Record<string, any>>(
  primaryFixtures: T[],
  fallbackFixtures: T[],
  hasEvidence: (fixture: T) => boolean,
): T[] {
  const key = (fixture: T): string => {
    const normalize = (value: unknown) =>
      typeof value === 'string'
        ? value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\b(fc|cf|sc|afc|club)\b/g, '').replace(/[^a-z0-9]/g, '')
        : '';
    return [
      normalize(fixture?.homeTeam?.name),
      normalize(fixture?.awayTeam?.name),
      String(fixture?.kickoffTime || '').slice(0, 10),
    ].join('|');
  };

  const primaryByKey = new Map<string, T>();
  for (const fixture of primaryFixtures) {
    primaryByKey.set(key(fixture), fixture);
  }

  const merged = primaryFixtures.map((fixture) => {
    if (hasEvidence(fixture)) return fixture;
    const fallback = fallbackFixtures.find((candidate) => key(candidate) === key(fixture));
    return fallback && hasEvidence(fallback) ? fallback : fixture;
  });

  // Preserve genuine fallback-only fixtures, but never let them replace a
  // fixture already enriched by a primary provider.
  const mergedKeys = new Set(merged.map(key));
  for (const fallback of fallbackFixtures) {
    if (!mergedKeys.has(key(fallback)) && hasEvidence(fallback)) {
      merged.push(fallback);
    }
  }

  return merged;
}
