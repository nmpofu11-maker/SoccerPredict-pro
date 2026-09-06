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

export function isFavouriteTeam(teamName: string): boolean {
  if (!teamName) return false;
  const norm = teamName.toLowerCase().replace(/\s+/g, ' ').trim();
  if (normalizedSet.has(norm)) return true;
  // Also check direct match in case of specific typography
  return PRIORITY_FAVOURITE_TEAMS.some(fav => {
    const fNorm = fav.toLowerCase().replace(/\s+/g, ' ').trim();
    return norm === fNorm || norm.includes(fNorm) || fNorm.includes(norm);
  });
}

export function isHighVolatilityLeague(leagueName: string): boolean {
  if (!leagueName) return false;
  const lower = leagueName.toLowerCase();
  return HIGH_VOLATILITY_LEAGUES.some(l => lower.includes(l.toLowerCase()));
}
