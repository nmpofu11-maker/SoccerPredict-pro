import { MatchFixture, ManualOverrideType, IngestionMetadata, DateRangeFilter } from '../types/soccer';
import initialFixtures from '../data/upcoming_fixtures.json';
import { isFavouriteTeam } from '../constants/favourites';

const STORAGE_KEYS = {
  OVERRIDES: 'soccer_engine_manual_overrides_v1',
  SETTINGS: 'soccer_engine_user_settings_v2',
  CUSTOM_FIXTURES: 'soccer_engine_live_fixtures_v7_real_active',
  LAST_INGESTION: 'soccer_engine_ingestion_metadata_v2',
};

export function getRealDefaultFixtures(): MatchFixture[] {
  return initialFixtures as MatchFixture[];
}

export interface UserSettings {
  activeTab: 'timeline' | 'favourites' | 'learning';
  searchQuery: string;
  selectedLeague: string;
  minConfidence: number;
  highlightFavourites: boolean;
  dateRange?: DateRangeFilter;
}

const DEFAULT_SETTINGS: UserSettings = {
  activeTab: 'timeline',
  searchQuery: '',
  selectedLeague: 'all',
  minConfidence: 0,
  highlightFavourites: true,
  dateRange: {
    startDate: '',
    endDate: '',
    presetId: 'all',
  },
};

/**
 * Load manual overrides map from browser localStorage
 */
export function loadManualOverrides(): Record<string, ManualOverrideType> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.OVERRIDES);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Failed to load overrides from localStorage', err);
  }
  return {};
}

/**
 * Persist a single manual override or remove it
 */
export function saveManualOverride(
  matchId: string,
  override: ManualOverrideType
): Record<string, ManualOverrideType> {
  const current = loadManualOverrides();
  if (override === 'none') {
    delete current[matchId];
  } else {
    current[matchId] = override;
  }
  try {
    localStorage.setItem(STORAGE_KEYS.OVERRIDES, JSON.stringify(current));
  } catch (err) {
    console.warn('Failed to save override to localStorage', err);
  }
  return current;
}

/**
 * Reset all manual overrides to automatic mathematical mode
 */
export function clearAllManualOverrides(): Record<string, ManualOverrideType> {
  try {
    localStorage.removeItem(STORAGE_KEYS.OVERRIDES);
  } catch (err) {
    console.warn('Failed to clear overrides', err);
  }
  return {};
}

/**
 * Load user interface settings & filters
 */
export function loadUserSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (err) {
    console.warn('Failed to load settings', err);
  }
  return DEFAULT_SETTINGS;
}

/**
 * Save user interface settings
 */
export function saveUserSettings(settings: Partial<UserSettings>): UserSettings {
  const current = loadUserSettings();
  const updated = { ...current, ...settings };
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to save settings', err);
  }
  return updated;
}

/**
 * Load fixtures from static bundle or cached user override
 */
export function loadFixturesDataset(): MatchFixture[] {
  try {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      // Proactively clear legacy mock versions from browser cache
      [
        'soccer_engine_custom_fixtures_v1',
        'soccer_engine_custom_fixtures_v2',
        'soccer_engine_custom_fixtures_v3',
        'soccer_engine_custom_fixtures_v4_real',
        'soccer_engine_custom_fixtures_v5_live_real',
        'soccer_engine_custom_fixtures_v6_real_march2025'
      ].forEach((legacyKey) => {
        localStorage.removeItem(legacyKey);
      });

      const custom = localStorage.getItem(STORAGE_KEYS.CUSTOM_FIXTURES);
      if (custom) {
        const parsed = JSON.parse(custom);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return sortFixturesByKickoff(parsed);
        }
      }
    }
  } catch (err) {
    console.warn('Error reading custom fixtures from cache', err);
  }

  // Fallback to verified real fixtures dataset
  return sortFixturesByKickoff(initialFixtures as MatchFixture[]);
}

/**
 * Strict Timeline Sorting:
 * Every list, card view, and tab display inside the entire app MUST be sorted
 * sequentially according to the match starting kickoff time string.
 * The game starting earliest must always remain at the top of the feed.
 */
export function sortFixturesByKickoff(fixtures: MatchFixture[]): MatchFixture[] {
  return [...fixtures].sort((a, b) => {
    const timeA = new Date(a.kickoffTime).getTime();
    const timeB = new Date(b.kickoffTime).getTime();
    return timeA - timeB;
  });
}

/**
 * Save custom or freshly imported scraped JSON
 */
export function saveCustomFixtures(fixtures: MatchFixture[]): boolean {
  try {
    const sorted = sortFixturesByKickoff(fixtures);
    localStorage.setItem(STORAGE_KEYS.CUSTOM_FIXTURES, JSON.stringify(sorted));
    updateIngestionMetadata(sorted);
    return true;
  } catch (err) {
    console.error('Failed to save custom fixtures to localStorage', err);
    return false;
  }
}

/**
 * Restore original static bundle fixtures
 */
export function restoreDefaultFixtures(): MatchFixture[] {
  try {
    localStorage.removeItem(STORAGE_KEYS.CUSTOM_FIXTURES);
  } catch (err) {
    console.warn('Failed to clear custom fixtures', err);
  }
  const defaultSorted = sortFixturesByKickoff(initialFixtures as MatchFixture[]);
  updateIngestionMetadata(defaultSorted);
  return defaultSorted;
}

/**
 * Ingestion metadata helper
 */
export function getIngestionMetadata(fixtures: MatchFixture[]): IngestionMetadata {
  const favCount = fixtures.filter(f =>
    isFavouriteTeam(f.homeTeam.name) || isFavouriteTeam(f.awayTeam.name)
  ).length;

  return {
    source: 'Local Scraper Static Manifest (upcoming_fixtures.json)',
    ingestionMode: 'Offline Static Cache — Zero Runtime Quota Overhead',
    lastParsedTimestamp: new Date().toISOString(),
    totalParsedFixtures: fixtures.length,
    favouriteMatchesCount: favCount,
    dataVersion: '1.4.2-local',
  };
}

function updateIngestionMetadata(fixtures: MatchFixture[]) {
  try {
    const meta = getIngestionMetadata(fixtures);
    localStorage.setItem(STORAGE_KEYS.LAST_INGESTION, JSON.stringify(meta));
  } catch {
    // ignore
  }
}
