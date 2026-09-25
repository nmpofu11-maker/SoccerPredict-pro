export interface LeagueInfo {
  id: string;
  name: string;
  country: string;
  region: 'south_africa' | 'england' | 'top5' | 'continental' | 'americas' | 'asia_pacific' | 'europe' | 'international';
  isHighVolatility: boolean;
  tier: number;
  flagEmoji: string;
  color: string;
}

export const LEAGUE_CATEGORIES = [
  { id: 'all', label: 'All Leagues', icon: 'Globe' },
  { id: 'south_africa', label: '🇿🇦 South Africa (PSL & NFD)', icon: 'Trophy' },
  { id: 'england', label: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 English Pyramid', icon: 'Shield' },
  { id: 'top5', label: '⭐ European Elite', icon: 'Trophy' },
  { id: 'continental', label: '🌍 UCL & CAF Cups', icon: 'Flame' },
  { id: 'europe', label: '🏰 European Leagues', icon: 'Shield' },
  { id: 'americas', label: '🌎 Americas & Global', icon: 'Compass' },
  { id: 'volatility', label: '⚠️ High-Volatility', icon: 'AlertTriangle' },
] as const;

export type LeagueCategoryId = typeof LEAGUE_CATEGORIES[number]['id'];

export const ALL_LEAGUES_DIRECTORY: Record<string, LeagueInfo> = {
  // South Africa (Hollywoodbets Core Markets)
  "South African Premiership": {
    id: "rsa_premiership",
    name: "South African Premiership",
    country: "South Africa",
    region: "south_africa",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇿🇦",
    color: "#059669",
  },
  "South African First Division": {
    id: "rsa_nfd",
    name: "South African First Division",
    country: "South Africa",
    region: "south_africa",
    isHighVolatility: true,
    tier: 2,
    flagEmoji: "🇿🇦",
    color: "#047857",
  },
  "South African MTN 8 Cup": {
    id: "rsa_mtn8",
    name: "South African MTN 8 Cup",
    country: "South Africa",
    region: "south_africa",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇿🇦",
    color: "#eab308",
  },
  "South African Nedbank Cup": {
    id: "rsa_nedbank",
    name: "South African Nedbank Cup",
    country: "South Africa",
    region: "south_africa",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇿🇦",
    color: "#16a34a",
  },

  // African Continental (CAF)
  "CAF Champions League": {
    id: "caf_cl",
    name: "CAF Champions League",
    country: "Africa",
    region: "continental",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🌍",
    color: "#ca8a04",
  },
  "CAF Confederation Cup": {
    id: "caf_cc",
    name: "CAF Confederation Cup",
    country: "Africa",
    region: "continental",
    isHighVolatility: false,
    tier: 2,
    flagEmoji: "🌍",
    color: "#d97706",
  },
  "FIFA World Cup Qualifying - CAF": {
    id: "caf_wcq",
    name: "FIFA World Cup Qualifying - CAF",
    country: "Africa",
    region: "continental",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🌍",
    color: "#15803d",
  },

  // English Pyramid
  "English Premier League": {
    id: "epl",
    name: "English Premier League",
    country: "England",
    region: "england",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    color: "#3b0764",
  },
  "English Championship": {
    id: "championship",
    name: "English Championship",
    country: "England",
    region: "england",
    isHighVolatility: true,
    tier: 2,
    flagEmoji: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    color: "#0f766e",
  },
  "English League One": {
    id: "league_one",
    name: "English League One",
    country: "England",
    region: "england",
    isHighVolatility: false,
    tier: 3,
    flagEmoji: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    color: "#0369a1",
  },
  "English League Two": {
    id: "league_two",
    name: "English League Two",
    country: "England",
    region: "england",
    isHighVolatility: true,
    tier: 4,
    flagEmoji: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    color: "#475569",
  },
  "English FA Cup": {
    id: "fa_cup",
    name: "English FA Cup",
    country: "England",
    region: "england",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    color: "#dc2626",
  },
  "English Carabao Cup": {
    id: "carabao_cup",
    name: "English Carabao Cup",
    country: "England",
    region: "england",
    isHighVolatility: false,
    tier: 2,
    flagEmoji: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    color: "#059669",
  },

  // European Continental
  "UEFA Champions League": {
    id: "ucl",
    name: "UEFA Champions League",
    country: "Europe",
    region: "continental",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "⭐",
    color: "#1e1b4b",
  },
  "UEFA Europa League": {
    id: "uel",
    name: "UEFA Europa League",
    country: "Europe",
    region: "continental",
    isHighVolatility: false,
    tier: 2,
    flagEmoji: "🟠",
    color: "#ea580c",
  },
  "UEFA Conference League": {
    id: "uecl",
    name: "UEFA Conference League",
    country: "Europe",
    region: "continental",
    isHighVolatility: false,
    tier: 3,
    flagEmoji: "🟢",
    color: "#10b981",
  },
  "UEFA Nations League": {
    id: "unl",
    name: "UEFA Nations League",
    country: "Europe",
    region: "continental",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇪🇺",
    color: "#0284c7",
  },
  "FIFA World Cup Qualifying - UEFA": {
    id: "uefa_wcq",
    name: "FIFA World Cup Qualifying - UEFA",
    country: "Europe",
    region: "continental",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇪🇺",
    color: "#1d4ed8",
  },

  // European Top Flights
  "Spanish La Liga": {
    id: "laliga",
    name: "Spanish La Liga",
    country: "Spain",
    region: "top5",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇪🇸",
    color: "#ef4444",
  },
  "Spanish LaLiga 2": {
    id: "laliga_2",
    name: "Spanish LaLiga 2",
    country: "Spain",
    region: "europe",
    isHighVolatility: true,
    tier: 2,
    flagEmoji: "🇪🇸",
    color: "#f87171",
  },
  "German Bundesliga": {
    id: "bundesliga",
    name: "German Bundesliga",
    country: "Germany",
    region: "top5",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇩🇪",
    color: "#dc2626",
  },
  "German 2. Bundesliga": {
    id: "bundesliga_2",
    name: "German 2. Bundesliga",
    country: "Germany",
    region: "europe",
    isHighVolatility: true,
    tier: 2,
    flagEmoji: "🇩🇪",
    color: "#b91c1c",
  },
  "Italian Serie A": {
    id: "serie_a",
    name: "Italian Serie A",
    country: "Italy",
    region: "top5",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇮🇹",
    color: "#0284c7",
  },
  "Italian Serie B": {
    id: "serie_b",
    name: "Italian Serie B",
    country: "Italy",
    region: "europe",
    isHighVolatility: true,
    tier: 2,
    flagEmoji: "🇮🇹",
    color: "#0369a1",
  },
  "French Ligue 1": {
    id: "ligue_1",
    name: "French Ligue 1",
    country: "France",
    region: "top5",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇫🇷",
    color: "#1e3a8a",
  },
  "French Ligue 2": {
    id: "ligue_2",
    name: "French Ligue 2",
    country: "France",
    region: "europe",
    isHighVolatility: true,
    tier: 2,
    flagEmoji: "🇫🇷",
    color: "#172554",
  },
  "Dutch Eredivisie": {
    id: "eredivisie",
    name: "Dutch Eredivisie",
    country: "Netherlands",
    region: "europe",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇳🇱",
    color: "#f97316",
  },
  "Portuguese Primeira Liga": {
    id: "primeira_liga",
    name: "Portuguese Primeira Liga",
    country: "Portugal",
    region: "europe",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇵🇹",
    color: "#15803d",
  },
  "Brazil Serie A": {
    id: "brazil_serie_a",
    name: "Brazil Serie A",
    country: "Brazil",
    region: "americas",
    isHighVolatility: true,
    tier: 1,
    flagEmoji: "🇧🇷",
    color: "#eab308",
  },
  "Argentina Primera División": {
    id: "arg_primera",
    name: "Argentina Primera División",
    country: "Argentina",
    region: "americas",
    isHighVolatility: true,
    tier: 1,
    flagEmoji: "🇦🇷",
    color: "#38bdf8",
  },
  "Major League Soccer (MLS)": {
    id: "mls",
    name: "Major League Soccer (MLS)",
    country: "USA/Canada",
    region: "americas",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇺🇸",
    color: "#2563eb",
  },
  "Saudi Pro League": {
    id: "saudi_pro",
    name: "Saudi Pro League",
    country: "Saudi Arabia",
    region: "asia_pacific",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇸🇦",
    color: "#16a34a",
  },
  "Turkey Süper Lig": {
    id: "turkey_super_lig",
    name: "Turkey Süper Lig",
    country: "Turkey",
    region: "europe",
    isHighVolatility: true,
    tier: 1,
    flagEmoji: "🇹🇷",
    color: "#be123c",
  },
  "Japan J1 League": {
    id: "j1_league",
    name: "Japan J1 League",
    country: "Japan",
    region: "asia_pacific",
    isHighVolatility: true,
    tier: 1,
    flagEmoji: "🇯🇵",
    color: "#e11d48",
  },
  "South Korea K League": {
    id: "k_league",
    name: "South Korea K League",
    country: "South Korea",
    region: "asia_pacific",
    isHighVolatility: true,
    tier: 1,
    flagEmoji: "🇰🇷",
    color: "#0369a1",
  },
  "Mexican Liga MX": {
    id: "liga_mx",
    name: "Mexican Liga MX",
    country: "Mexico",
    region: "americas",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇲🇽",
    color: "#16a34a",
  },
  "Scottish Premiership": {
    id: "scottish_prem",
    name: "Scottish Premiership",
    country: "Scotland",
    region: "europe",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
    color: "#1e40af",
  },
  "Belgian Pro League": {
    id: "belgian_pro",
    name: "Belgian Pro League",
    country: "Belgium",
    region: "europe",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇧🇪",
    color: "#b91c1c",
  },
  "Croatian HNL": {
    id: "croatian_hnl",
    name: "Croatian HNL",
    country: "Croatia",
    region: "europe",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇭🇷",
    color: "#dc2626",
  },
  "Romanian Liga I": {
    id: "romanian_liga",
    name: "Romanian Liga I",
    country: "Romania",
    region: "europe",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇷🇴",
    color: "#eab308",
  },
  "Greek Super League 1": {
    id: "greek_super",
    name: "Greek Super League 1",
    country: "Greece",
    region: "europe",
    isHighVolatility: true,
    tier: 1,
    flagEmoji: "🇬🇷",
    color: "#0284c7",
  },
  "Colombia Primera A": {
    id: "colombia_primera",
    name: "Colombia Primera A",
    country: "Colombia",
    region: "americas",
    isHighVolatility: true,
    tier: 1,
    flagEmoji: "🇨🇴",
    color: "#ca8a04",
  },
  "Bolivian Primera División": {
    id: "bolivia_primera",
    name: "Bolivian Primera División",
    country: "Bolivia",
    region: "americas",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇧🇴",
    color: "#059669",
  },
  "Chile Primera División": {
    id: "chile_primera",
    name: "Chile Primera División",
    country: "Chile",
    region: "americas",
    isHighVolatility: true,
    tier: 1,
    flagEmoji: "🇨🇱",
    color: "#2563eb",
  },
  "Chinese Super League": {
    id: "csl",
    name: "Chinese Super League",
    country: "China",
    region: "asia_pacific",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇨🇳",
    color: "#dc2626",
  },
  "Swedish Division 1": {
    id: "swedish_div1",
    name: "Swedish Division 1",
    country: "Sweden",
    region: "europe",
    isHighVolatility: false,
    tier: 3,
    flagEmoji: "🇸🇪",
    color: "#0284c7",
  },
  "Irish Premier Division": {
    id: "irish_prem",
    name: "Irish Premier Division",
    country: "Ireland",
    region: "europe",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇮🇪",
    color: "#16a34a",
  },
  "Latvian Virsliga": {
    id: "latvian_virsliga",
    name: "Latvian Virsliga",
    country: "Latvia",
    region: "europe",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇱🇻",
    color: "#831843",
  },
  "Malaysian Super League": {
    id: "malaysian_super",
    name: "Malaysian Super League",
    country: "Malaysia",
    region: "asia_pacific",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇲🇾",
    color: "#0284c7",
  },
  "Major League Soccer": {
    id: "mls",
    name: "Major League Soccer",
    country: "USA/Canada",
    region: "americas",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇺🇸",
    color: "#2563eb",
  },
  "Brazilian Serie A": {
    id: "brazil_serie_a",
    name: "Brazilian Serie A",
    country: "Brazil",
    region: "americas",
    isHighVolatility: true,
    tier: 1,
    flagEmoji: "🇧🇷",
    color: "#eab308",
  },
  "Argentine Liga Profesional": {
    id: "arg_primera",
    name: "Argentine Liga Profesional",
    country: "Argentina",
    region: "americas",
    isHighVolatility: true,
    tier: 1,
    flagEmoji: "🇦🇷",
    color: "#38bdf8",
  },
  "Turkish Super Lig": {
    id: "turkey_super_lig",
    name: "Turkish Super Lig",
    country: "Turkey",
    region: "europe",
    isHighVolatility: true,
    tier: 1,
    flagEmoji: "🇹🇷",
    color: "#be123c",
  },
  "Greek Super League": {
    id: "greek_super",
    name: "Greek Super League",
    country: "Greece",
    region: "europe",
    isHighVolatility: true,
    tier: 1,
    flagEmoji: "🇬🇷",
    color: "#0284c7",
  },
  "Swiss Super League": {
    id: "swiss_super",
    name: "Swiss Super League",
    country: "Switzerland",
    region: "europe",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇨🇭",
    color: "#dc2626",
  },
  "Austrian Bundesliga": {
    id: "austrian_bundesliga",
    name: "Austrian Bundesliga",
    country: "Austria",
    region: "europe",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇦🇹",
    color: "#b91c1c",
  },
  "Danish Superliga": {
    id: "danish_superliga",
    name: "Danish Superliga",
    country: "Denmark",
    region: "europe",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇩🇰",
    color: "#ef4444",
  },
  "Norwegian Eliteserien": {
    id: "norwegian_eliteserien",
    name: "Norwegian Eliteserien",
    country: "Norway",
    region: "europe",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇳🇴",
    color: "#1e3a8a",
  },
  "Swedish Allsvenskan": {
    id: "swedish_allsvenskan",
    name: "Swedish Allsvenskan",
    country: "Sweden",
    region: "europe",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇸🇪",
    color: "#0284c7",
  },
  "Australian A-League": {
    id: "a_league",
    name: "Australian A-League",
    country: "Australia",
    region: "asia_pacific",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇦🇺",
    color: "#ea580c",
  },
  "Japanese J.League": {
    id: "j_league",
    name: "Japanese J.League",
    country: "Japan",
    region: "asia_pacific",
    isHighVolatility: true,
    tier: 1,
    flagEmoji: "🇯🇵",
    color: "#e11d48",
  },
  "FIFA World Cup Qualifying - CONMEBOL": {
    id: "conmebol_wcq",
    name: "FIFA World Cup Qualifying - CONMEBOL",
    country: "South America",
    region: "americas",
    isHighVolatility: true,
    tier: 1,
    flagEmoji: "🌎",
    color: "#16a34a",
  },
  "South African Carling Knockout Cup": {
    id: "rsa_carling",
    name: "South African Carling Knockout Cup",
    country: "South Africa",
    region: "south_africa",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇿🇦",
    color: "#b45309",
  },
  "Scottish Championship": {
    id: "scottish_champ",
    name: "Scottish Championship",
    country: "Scotland",
    region: "europe",
    isHighVolatility: true,
    tier: 2,
    flagEmoji: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
    color: "#1d4ed8",
  },
  "Copa Libertadores": {
    id: "copa_libertadores",
    name: "Copa Libertadores",
    country: "South America",
    region: "americas",
    isHighVolatility: true,
    tier: 1,
    flagEmoji: "🏆",
    color: "#eab308",
  },
  "Copa Sudamericana": {
    id: "copa_sudamericana",
    name: "Copa Sudamericana",
    country: "South America",
    region: "americas",
    isHighVolatility: true,
    tier: 2,
    flagEmoji: "🥈",
    color: "#0284c7",
  },
  "Spanish Copa del Rey": {
    id: "copa_del_rey",
    name: "Spanish Copa del Rey",
    country: "Spain",
    region: "top5",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇪🇸",
    color: "#dc2626",
  },
  "Italian Coppa Italia": {
    id: "coppa_italia",
    name: "Italian Coppa Italia",
    country: "Italy",
    region: "top5",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇮🇹",
    color: "#15803d",
  },
  "German DFB-Pokal": {
    id: "dfb_pokal",
    name: "German DFB-Pokal",
    country: "Germany",
    region: "top5",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇩🇪",
    color: "#ca8a04",
  },
  "French Coupe de France": {
    id: "coupe_de_france",
    name: "French Coupe de France",
    country: "France",
    region: "top5",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇫🇷",
    color: "#1e3a8a",
  },
  "Dutch KNVB Beker": {
    id: "knvb_beker",
    name: "Dutch KNVB Beker",
    country: "Netherlands",
    region: "europe",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🇳🇱",
    color: "#ea580c",
  },
  "International Matches": {
    id: "international",
    name: "International Matches",
    country: "Global",
    region: "international",
    isHighVolatility: false,
    tier: 1,
    flagEmoji: "🌍",
    color: "#475569",
  },
};

export function getLeagueMeta(leagueName: string): LeagueInfo {
  if (!leagueName) {
    return {
      id: "unknown",
      name: "Unknown League",
      country: "Global",
      region: "europe",
      isHighVolatility: false,
      tier: 1,
      flagEmoji: "⚽",
      color: "#334155",
    };
  }

  // 1. Exact match in directory
  if (ALL_LEAGUES_DIRECTORY[leagueName]) {
    return ALL_LEAGUES_DIRECTORY[leagueName];
  }

  // 2. Case-insensitive / normalized match in directory
  const normalizedKey = leagueName.toLowerCase().trim();
  for (const [key, info] of Object.entries(ALL_LEAGUES_DIRECTORY)) {
    if (key.toLowerCase() === normalizedKey) {
      return info;
    }
  }

  // 3. Known aliases
  const aliasMap: Record<string, string> = {
    'japanese j1 league': 'Japanese J.League',
    'j1 league': 'Japanese J.League',
    'j.league': 'Japanese J.League',
    'premier league': 'English Premier League',
    'epl': 'English Premier League',
    'la liga': 'Spanish La Liga',
    'laliga': 'Spanish La Liga',
    'serie a': 'Italian Serie A',
    'bundesliga': 'German Bundesliga',
    'ligue 1': 'French Ligue 1',
    'psl': 'South African Premiership',
    'mls': 'Major League Soccer',
    'champions league': 'UEFA Champions League',
    'ucl': 'UEFA Champions League',
    'europa league': 'UEFA Europa League',
    'uel': 'UEFA Europa League',
  };

  if (aliasMap[normalizedKey] && ALL_LEAGUES_DIRECTORY[aliasMap[normalizedKey]]) {
    return ALL_LEAGUES_DIRECTORY[aliasMap[normalizedKey]];
  }

  // 4. Prefix-based resolution for "Country • Competition" format
  if (leagueName.includes('•')) {
    const rawCountryPrefix = leagueName.split('•')[0].trim();
    const cLower = rawCountryPrefix.toLowerCase();
    
    if (/nigeria/i.test(cLower)) {
      return {
        id: leagueName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        name: leagueName,
        country: "Nigeria",
        region: "continental",
        isHighVolatility: false,
        tier: 1,
        flagEmoji: "🇳🇬",
        color: "#15803d",
      };
    }
    if (/israel/i.test(cLower)) {
      return {
        id: leagueName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        name: leagueName,
        country: "Israel",
        region: "europe",
        isHighVolatility: false,
        tier: 1,
        flagEmoji: "🇮🇱",
        color: "#0284c7",
      };
    }
    if (/south africa/i.test(cLower)) {
      return {
        id: leagueName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        name: leagueName,
        country: "South Africa",
        region: "south_africa",
        isHighVolatility: false,
        tier: 1,
        flagEmoji: "🇿🇦",
        color: "#059669",
      };
    }
    if (/england/i.test(cLower)) {
      return {
        id: leagueName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        name: leagueName,
        country: "England",
        region: "england",
        isHighVolatility: false,
        tier: 1,
        flagEmoji: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
        color: "#3b0764",
      };
    }
    if (/jordan/i.test(cLower)) {
      return {
        id: leagueName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        name: leagueName,
        country: "Jordan",
        region: "asia_pacific",
        isHighVolatility: false,
        tier: 1,
        flagEmoji: "🇯🇴",
        color: "#047857",
      };
    }
    if (/austria/i.test(cLower)) {
      return {
        id: leagueName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        name: leagueName,
        country: "Austria",
        region: "europe",
        isHighVolatility: false,
        tier: 1,
        flagEmoji: "🇦🇹",
        color: "#b91c1c",
      };
    }
    if (/egypt/i.test(cLower)) {
      return {
        id: leagueName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        name: leagueName,
        country: "Egypt",
        region: "continental",
        isHighVolatility: false,
        tier: 1,
        flagEmoji: "🇪🇬",
        color: "#b45309",
      };
    }
    if (/ghana/i.test(cLower)) {
      return {
        id: leagueName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        name: leagueName,
        country: "Ghana",
        region: "continental",
        isHighVolatility: false,
        tier: 1,
        flagEmoji: "🇬🇭",
        color: "#d97706",
      };
    }
    if (/morocco/i.test(cLower)) {
      return {
        id: leagueName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        name: leagueName,
        country: "Morocco",
        region: "continental",
        isHighVolatility: false,
        tier: 1,
        flagEmoji: "🇲🇦",
        color: "#dc2626",
      };
    }
  }

  // 5. Heuristic inference by country keywords
  let inferredCountry = "Global";
  let inferredFlag = "⚽";
  let inferredRegion: LeagueInfo['region'] = "europe";

  if (/south africa|psl|nfd|mtn\s*8|nedbank/i.test(normalizedKey)) {
    inferredCountry = "South Africa";
    inferredFlag = "🇿🇦";
    inferredRegion = "south_africa";
  } else if (/nigeria/i.test(normalizedKey)) {
    inferredCountry = "Nigeria";
    inferredFlag = "🇳🇬";
    inferredRegion = "continental";
  } else if (/israel/i.test(normalizedKey)) {
    inferredCountry = "Israel";
    inferredFlag = "🇮🇱";
    inferredRegion = "europe";
  } else if (/ghana/i.test(normalizedKey)) {
    inferredCountry = "Ghana";
    inferredFlag = "🇬🇭";
    inferredRegion = "continental";
  } else if (/egypt/i.test(normalizedKey)) {
    inferredCountry = "Egypt";
    inferredFlag = "🇪🇬";
    inferredRegion = "continental";
  } else if (/morocco/i.test(normalizedKey)) {
    inferredCountry = "Morocco";
    inferredFlag = "🇲🇦";
    inferredRegion = "continental";
  } else if (/algeria/i.test(normalizedKey)) {
    inferredCountry = "Algeria";
    inferredFlag = "🇩🇿";
    inferredRegion = "continental";
  } else if (/kenya/i.test(normalizedKey)) {
    inferredCountry = "Kenya";
    inferredFlag = "🇰🇪";
    inferredRegion = "continental";
  } else if (/zambia/i.test(normalizedKey)) {
    inferredCountry = "Zambia";
    inferredFlag = "🇿🇲";
    inferredRegion = "continental";
  } else if (/tanzania/i.test(normalizedKey)) {
    inferredCountry = "Tanzania";
    inferredFlag = "🇹🇿";
    inferredRegion = "continental";
  } else if (/uganda/i.test(normalizedKey)) {
    inferredCountry = "Uganda";
    inferredFlag = "🇺🇬";
    inferredRegion = "continental";
  } else if (/england|english|\bepl\b|championship|fa cup|carabao/i.test(normalizedKey) || normalizedKey === 'premier league') {
    inferredCountry = "England";
    inferredFlag = "🏴󠁧󠁢󠁥󠁮󠁧󠁿";
    inferredRegion = "england";
  } else if (/spain|spanish|la liga|copa del rey/i.test(normalizedKey)) {
    inferredCountry = "Spain";
    inferredFlag = "🇪🇸";
    inferredRegion = "top5";
  } else if (/germany|german|bundesliga|dfb/i.test(normalizedKey)) {
    inferredCountry = "Germany";
    inferredFlag = "🇩🇪";
    inferredRegion = "top5";
  } else if (/italy|italian|serie a|serie b|coppa italia/i.test(normalizedKey)) {
    inferredCountry = "Italy";
    inferredFlag = "🇮🇹";
    inferredRegion = "top5";
  } else if (/france|french|ligue 1|ligue 2|coupe de france/i.test(normalizedKey)) {
    inferredCountry = "France";
    inferredFlag = "🇫🇷";
    inferredRegion = "top5";
  } else if (/scotland|scottish/i.test(normalizedKey)) {
    inferredCountry = "Scotland";
    inferredFlag = "🏴󠁧󠁢󠁳󠁣󠁴󠁿";
    inferredRegion = "europe";
  } else if (/portugal|portuguese|primeira/i.test(normalizedKey)) {
    inferredCountry = "Portugal";
    inferredFlag = "🇵🇹";
    inferredRegion = "europe";
  } else if (/netherlands|dutch|eredivisie|knvb/i.test(normalizedKey)) {
    inferredCountry = "Netherlands";
    inferredFlag = "🇳🇱";
    inferredRegion = "europe";
  } else if (/brazil|brazilian/i.test(normalizedKey)) {
    inferredCountry = "Brazil";
    inferredFlag = "🇧🇷";
    inferredRegion = "americas";
  } else if (/argentina|argentine/i.test(normalizedKey)) {
    inferredCountry = "Argentina";
    inferredFlag = "🇦🇷";
    inferredRegion = "americas";
  } else if (/japan|japanese/i.test(normalizedKey)) {
    inferredCountry = "Japan";
    inferredFlag = "🇯🇵";
    inferredRegion = "asia_pacific";
  } else if (/saudi/i.test(normalizedKey)) {
    inferredCountry = "Saudi Arabia";
    inferredFlag = "🇸🇦";
    inferredRegion = "asia_pacific";
  } else if (/swiss|switzerland/i.test(normalizedKey)) {
    inferredCountry = "Switzerland";
    inferredFlag = "🇨🇭";
    inferredRegion = "europe";
  } else if (/austria|austrian/i.test(normalizedKey)) {
    inferredCountry = "Austria";
    inferredFlag = "🇦🇹";
    inferredRegion = "europe";
  } else if (/belgi/i.test(normalizedKey)) {
    inferredCountry = "Belgium";
    inferredFlag = "🇧🇪";
    inferredRegion = "europe";
  } else if (/turk/i.test(normalizedKey)) {
    inferredCountry = "Turkey";
    inferredFlag = "🇹🇷";
    inferredRegion = "europe";
  } else if (/denmark|danish/i.test(normalizedKey)) {
    inferredCountry = "Denmark";
    inferredFlag = "🇩🇰";
    inferredRegion = "europe";
  } else if (/sweden|swedish/i.test(normalizedKey)) {
    inferredCountry = "Sweden";
    inferredFlag = "🇸🇪";
    inferredRegion = "europe";
  } else if (/norway|norwegian/i.test(normalizedKey)) {
    inferredCountry = "Norway";
    inferredFlag = "🇳🇴";
    inferredRegion = "europe";
  } else if (/greece|greek/i.test(normalizedKey)) {
    inferredCountry = "Greece";
    inferredFlag = "🇬🇷";
    inferredRegion = "europe";
  } else if (/mexic/i.test(normalizedKey)) {
    inferredCountry = "Mexico";
    inferredFlag = "🇲🇽";
    inferredRegion = "americas";
  } else if (/colombia/i.test(normalizedKey)) {
    inferredCountry = "Colombia";
    inferredFlag = "🇨🇴";
    inferredRegion = "americas";
  } else if (/chile/i.test(normalizedKey)) {
    inferredCountry = "Chile";
    inferredFlag = "🇨🇱";
    inferredRegion = "americas";
  } else if (/bolivia/i.test(normalizedKey)) {
    inferredCountry = "Bolivia";
    inferredFlag = "🇧🇴";
    inferredRegion = "americas";
  } else if (/chin/i.test(normalizedKey)) {
    inferredCountry = "China";
    inferredFlag = "🇨🇳";
    inferredRegion = "asia_pacific";
  } else if (/australia/i.test(normalizedKey)) {
    inferredCountry = "Australia";
    inferredFlag = "🇦🇺";
    inferredRegion = "asia_pacific";
  } else if (/uefa|champions league|europa|nations league/i.test(normalizedKey)) {
    inferredCountry = "Europe";
    inferredFlag = "🇪🇺";
    inferredRegion = "continental";
  } else if (/caf|africa/i.test(normalizedKey)) {
    inferredCountry = "Africa";
    inferredFlag = "🌍";
    inferredRegion = "continental";
  } else if (/conmebol|libertadores|sudamericana/i.test(normalizedKey)) {
    inferredCountry = "South America";
    inferredFlag = "🌎";
    inferredRegion = "continental";
  } else if (/mls|major league soccer|usa/i.test(normalizedKey)) {
    inferredCountry = "USA/Canada";
    inferredFlag = "🇺🇸";
    inferredRegion = "americas";
  } else if (/san marino|sammarinese/i.test(normalizedKey)) {
    inferredCountry = "San Marino";
    inferredFlag = "🇸🇲";
    inferredRegion = "europe";
  } else if (/paraguay/i.test(normalizedKey)) {
    inferredCountry = "Paraguay";
    inferredFlag = "🇵🇾";
    inferredRegion = "americas";
  } else if (/israel/i.test(normalizedKey)) {
    inferredCountry = "Israel";
    inferredFlag = "🇮🇱";
    inferredRegion = "europe";
  } else if (/egypt/i.test(normalizedKey)) {
    inferredCountry = "Egypt";
    inferredFlag = "🇪🇬";
    inferredRegion = "continental";
  } else if (/north macedonia|macedonia/i.test(normalizedKey)) {
    inferredCountry = "North Macedonia";
    inferredFlag = "🇲🇰";
    inferredRegion = "europe";
  } else if (/slovakia/i.test(normalizedKey)) {
    inferredCountry = "Slovakia";
    inferredFlag = "🇸🇰";
    inferredRegion = "europe";
  } else if (/united arab emirates|uae/i.test(normalizedKey)) {
    inferredCountry = "UAE";
    inferredFlag = "🇦🇪";
    inferredRegion = "asia_pacific";
  } else if (/qatar/i.test(normalizedKey)) {
    inferredCountry = "Qatar";
    inferredFlag = "🇶🇦";
    inferredRegion = "asia_pacific";
  } else if (/estonia/i.test(normalizedKey)) {
    inferredCountry = "Estonia";
    inferredFlag = "🇪🇪";
    inferredRegion = "europe";
  } else if (/oman/i.test(normalizedKey)) {
    inferredCountry = "Oman";
    inferredFlag = "🇴🇲";
    inferredRegion = "asia_pacific";
  } else if (/croatia/i.test(normalizedKey)) {
    inferredCountry = "Croatia";
    inferredFlag = "🇭🇷";
    inferredRegion = "europe";
  } else if (/nigeria/i.test(normalizedKey)) {
    inferredCountry = "Nigeria";
    inferredFlag = "🇳🇬";
    inferredRegion = "continental";
  } else if (/finland/i.test(normalizedKey)) {
    inferredCountry = "Finland";
    inferredFlag = "🇫🇮";
    inferredRegion = "europe";
  } else if (/jordan/i.test(normalizedKey)) {
    inferredCountry = "Jordan";
    inferredFlag = "🇯🇴";
    inferredRegion = "asia_pacific";
  } else if (/switzerland|swiss/i.test(normalizedKey)) {
    inferredCountry = "Switzerland";
    inferredFlag = "🇨🇭";
    inferredRegion = "europe";
  } else if (/uruguay/i.test(normalizedKey)) {
    inferredCountry = "Uruguay";
    inferredFlag = "🇺🇾";
    inferredRegion = "americas";
  } else if (/ecuador/i.test(normalizedKey)) {
    inferredCountry = "Ecuador";
    inferredFlag = "🇪🇨";
    inferredRegion = "americas";
  } else if (/puerto rico/i.test(normalizedKey)) {
    inferredCountry = "Puerto Rico";
    inferredFlag = "🇵🇷";
    inferredRegion = "americas";
  } else if (/morocco/i.test(normalizedKey)) {
    inferredCountry = "Morocco";
    inferredFlag = "🇲🇦";
    inferredRegion = "continental";
  } else if (/el salvador/i.test(normalizedKey)) {
    inferredCountry = "El Salvador";
    inferredFlag = "🇸🇻";
    inferredRegion = "americas";
  } else if (/panama/i.test(normalizedKey)) {
    inferredCountry = "Panama";
    inferredFlag = "🇵🇦";
    inferredRegion = "americas";
  } else if (/honduras/i.test(normalizedKey)) {
    inferredCountry = "Honduras";
    inferredFlag = "🇭🇳";
    inferredRegion = "americas";
  } else if (/myanmar/i.test(normalizedKey)) {
    inferredCountry = "Myanmar";
    inferredFlag = "🇲🇲";
    inferredRegion = "asia_pacific";
  } else if (/argentina/i.test(normalizedKey)) {
    inferredCountry = "Argentina";
    inferredFlag = "🇦🇷";
    inferredRegion = "americas";
  }

  return {
    id: leagueName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
    name: leagueName,
    country: inferredCountry,
    region: inferredRegion,
    isHighVolatility: false,
    tier: 1,
    flagEmoji: inferredFlag,
    color: "#334155",
  };
}

export function matchesLeagueCategory(leagueName: string, categoryId: LeagueCategoryId): boolean {
  if (!categoryId || categoryId === 'all') return true;

  const meta = getLeagueMeta(leagueName);

  if (categoryId === 'volatility') {
    return meta.isHighVolatility;
  }

  if (categoryId === 'top5') {
    const top5Leagues = [
      'English Premier League',
      'Spanish La Liga',
      'German Bundesliga',
      'Italian Serie A',
      'French Ligue 1',
    ];
    return top5Leagues.includes(leagueName);
  }

  if (categoryId === 'england') {
    return meta.region === 'england' || leagueName.startsWith('English ');
  }

  if (categoryId === 'south_africa') {
    return meta.region === 'south_africa' || leagueName.startsWith('South African ');
  }

  return meta.region === categoryId;
}
