const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

function parseIsoWithZone(value: unknown): string | null {
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:?\d{2})$/i.test(value.trim())) return null;
  const parsed = new Date(value.trim());
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function parseUtcValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const explicitlyZoned = parseIsoWithZone(trimmed);
  if (explicitlyZoned) return explicitlyZoned;
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(trimmed)) return null;
  const normalized = trimmed.replace(' ', 'T');
  return parseIsoWithZone(`${normalized.length === 16 ? `${normalized}:00` : normalized}Z`);
}

function parseBerlinLocalDateTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const explicitlyZoned = parseIsoWithZone(trimmed);
  if (explicitlyZoned) return explicitlyZoned;

  const match = localDateTimePattern.exec(trimmed);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '00'] = match;
  const parts = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const [year, month, day, hour, minute, second] = parts;
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(wallClockAsUtc);
  if (
    check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day || check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute || check.getUTCSeconds() !== second
  ) return null;

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });

  // Convert the documented CET/CEST wall clock to UTC without assuming that
  // the host machine uses the same timezone as the provider.
  let utcMs = wallClockAsUtc;
  for (let attempt = 0; attempt < 3; attempt++) {
    const localParts = Object.fromEntries(
      formatter.formatToParts(new Date(utcMs))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    ) as Record<string, number>;
    const representedAsUtc = Date.UTC(
      localParts.year, localParts.month - 1, localParts.day,
      localParts.hour, localParts.minute, localParts.second,
    );
    utcMs = wallClockAsUtc - (representedAsUtc - utcMs);
  }

  return Number.isFinite(utcMs) ? new Date(utcMs).toISOString() : null;
}

/**
 * SportAPI documents kickoff_utc as UTC and datetime as a Europe/Berlin
 * calendar time. Prefer the unambiguous UTC field; convert the local field
 * using the provider's documented timezone only as a fallback.
 */
export function parseSportApiAiKickoff(fixture: Record<string, unknown>): string | null {
  return parseUtcValue(fixture.kickoff_utc) ??
    parseUtcValue(fixture.utc_date) ??
    parseBerlinLocalDateTime(fixture.datetime) ??
    parseIsoWithZone(fixture.kickoff_time) ??
    parseIsoWithZone(fixture.start_time) ??
    (typeof fixture.date === 'string' && /[T ]\d{2}:\d{2}/.test(fixture.date)
      ? parseIsoWithZone(fixture.date)
      : null);
}
