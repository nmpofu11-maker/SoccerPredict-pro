/**
 * The 80 Priority Favourite Teams Matrix as specified in system specifications.
 * If ANY match contains one of these teams (either Home or Away), the system
 * flags is_favourite = true, auto-forces win floor to >= 55% under Rule 8,
 * and routes it into the dedicated Favourites Tab view.
 */
export const PRIORITY_FAVOURITE_TEAMS: readonly string[] = [
  "Bolivar", "St Patrick's Athletic", "Madura United", "Japan U", "Ahlafors IF",
  "Real Cartagena", "Vorup FB", "Haugesund B", "Riga FC", "Shelbourne Women",
  "FC Flora Tallinn", "NEC Nijmegen", "MSK Zilina", "ZNK Agram (w)", "Saldus SS/Leevon",
  "Viimsi JK", "Truong Tuoi Dong Nai", "Nacional De Football Women", "Lillestrom B", "FK Rostov Youth",
  "Club Brugge", "Dinamo Zagreb", "Inter Milan Women", "FC Ulaanbaatar", "FC Nomme United",
  "Qingdao Team", "Atletico Nacional Medellin (W)", "FC Iberia  Tbilisi", "Rijeka", "Poland Women",
  "PVF-CAND FC", "Tvaakers IF", "Beijing Guoan", "Peru Women", "Napoli",
  "MC Oran", "Mohun Bagan Super Giant", "Rosenborg BK Women", "Lorenskog U", "Penarol Reserve",
  "BK Forward", "Uruguay", "Us Pergolettese", "France U", "Tabor Sezana",
  "Fram Reykjavik", "Linfield Women", "Rigas Futbola Skola", "FC Noah", "Taftea IK",
  "FC Gomel", "FC Nantes", "FC Dinamo City", "Shanghai Shenhua", "Shanghai Port",
  "Boston River Reserve", "Smedby AIS", "Baerum U", "Johor Darul Ta'zim FC", "Qviding FIF",
  "Hunters FC", "KF Laci", "Slovan Ljubljana", "St Johnstone FC", "Pattani",
  "RC Sporting Charleroi", "Benfica U", "Fotbal Club FCSB", "Sligo Rovers Women", "Tabora United FC",
  "FK Mladost DG", "FC Pyunik", "Stenungsunds IF", "Almaz Antey Youth", "BE NFA",
  "Azam", "Ekenas IF Fotbolll", "Dnepr Mogilev", "Wolfsberger AC Amateure", "Gnistan Helsinki"
] as const;

/**
 * Master configuration array of highly unpredictable leagues where extreme
 * probability spikes are compressed toward a safer baseline distribution (Rule 7).
 */
export const HIGH_VOLATILITY_LEAGUES: readonly string[] = [
  "Japan J1 League",
  "Japanese J.League",
  "Turkey Süper Lig",
  "Turkish Super Lig",
  "South Korea K League",
  "Brazil Serie A",
  "Brazilian Serie A",
  "Argentina Primera División",
  "Argentine Liga Profesional",
  "English Championship",
  "English League Two",
  "South African First Division",
  "Spanish LaLiga 2",
  "German 2. Bundesliga",
  "Italian Serie B",
  "French Ligue 2",
  "Greece Super League 1",
  "Greek Super League",
  "Chile Primera División",
  "Colombia Primera A",
  "FIFA World Cup Qualifying - CONMEBOL",
] as const;

// Create a fast lookup Set with normalized strings
const normalizedSet = new Set(
  PRIORITY_FAVOURITE_TEAMS.map(t => t.toLowerCase().replace(/\s+/g, ' ').trim())
);

export function isFavouriteTeam(teamName?: string): boolean {
  if (!teamName) return false;
  const norm = teamName.toLowerCase().replace(/\s+/g, ' ').trim();
  if (normalizedSet.has(norm)) return true;
  // Also check direct match in case of specific typography
  return PRIORITY_FAVOURITE_TEAMS.some(fav => {
    const fNorm = fav.toLowerCase().replace(/\s+/g, ' ').trim();
    return norm === fNorm || norm.includes(fNorm);
  });
}

export function isHighVolatilityLeague(leagueName?: string): boolean {
  if (!leagueName) return false;
  const lower = leagueName.toLowerCase();
  return HIGH_VOLATILITY_LEAGUES.some(l => lower.includes(l.toLowerCase()));
}

/**
 * Leagues historically characterized by compact defensive blocks, low average goals,
 * and high draw frequencies (~28-33% statistical rate).
 */
export const DEFENSIVE_DRAW_HEAVY_LEAGUES: readonly string[] = [
  "Italian Serie A",
  "Italy Serie A",
  "French Ligue 1",
  "France Ligue 1",
  "French Ligue 2",
  "Italian Serie B",
  "Spanish LaLiga 2",
  "Argentina Primera División",
  "Argentine Liga Profesional",
  "Greece Super League 1",
  "Greek Super League",
  "South African Premiership",
] as const;

/**
 * Leagues with elevated tempo, high conversion rates, and high goal expectancy (>2.9 goals/game).
 */
export const HIGH_SCORING_LEAGUES: readonly string[] = [
  "German Bundesliga",
  "Germany Bundesliga",
  "Dutch Eredivisie",
  "Netherlands Eredivisie",
  "Major League Soccer",
  "USA MLS",
  "Belgian Pro League",
  "Norway Eliteserien",
  "Austria Bundesliga",
  "Switzerland Super League",
] as const;

/**
 * Leagues with pronounced home crowd and geographical fortress advantage.
 */
export const HIGH_HOME_FORTRESS_LEAGUES: readonly string[] = [
  "English Premier League",
  "Turkey Süper Lig",
  "Turkish Super Lig",
  "Brazil Serie A",
  "Brazilian Serie A",
  "Bolivia Primera",
  "UEFA Champions League",
] as const;

export interface LeagueClusterProfile {
  archetype: 'defensive_draw' | 'high_scoring' | 'home_fortress' | 'volatile' | 'standard';
  drawBias: number; // e.g. +1.2 pts to draw
  homeMultiplierBonus: number; // e.g. +0.05
  volatilityDamping: boolean;
  label: string;
}

export function getLeagueClusterProfile(leagueName?: string): LeagueClusterProfile {
  if (!leagueName) {
    return { archetype: 'standard', drawBias: 0, homeMultiplierBonus: 0, volatilityDamping: false, label: 'Standard League Profile' };
  }
  const lower = leagueName.toLowerCase();

  if (DEFENSIVE_DRAW_HEAVY_LEAGUES.some(l => lower.includes(l.toLowerCase()))) {
    return {
      archetype: 'defensive_draw',
      drawBias: 1.15,
      homeMultiplierBonus: -0.02,
      volatilityDamping: false,
      label: 'Defensive / Draw-Heavy League (Serie A / Ligue 1 Cluster)',
    };
  }

  if (HIGH_SCORING_LEAGUES.some(l => lower.includes(l.toLowerCase()))) {
    return {
      archetype: 'high_scoring',
      drawBias: -0.85,
      homeMultiplierBonus: 0.04,
      volatilityDamping: false,
      label: 'High-Scoring / Open Transition League (Bundesliga / Eredivisie Cluster)',
    };
  }

  if (HIGH_HOME_FORTRESS_LEAGUES.some(l => lower.includes(l.toLowerCase()))) {
    return {
      archetype: 'home_fortress',
      drawBias: -0.3,
      homeMultiplierBonus: 0.06,
      volatilityDamping: false,
      label: 'Home Fortress League (Premier League / Süper Lig Cluster)',
    };
  }

  if (isHighVolatilityLeague(leagueName)) {
    return {
      archetype: 'volatile',
      drawBias: 0.5,
      homeMultiplierBonus: 0,
      volatilityDamping: true,
      label: 'High-Volatility League (Compression Active)',
    };
  }

  return {
    archetype: 'standard',
    drawBias: 0,
    homeMultiplierBonus: 0,
    volatilityDamping: false,
    label: 'Standard Balanced League',
  };
}

