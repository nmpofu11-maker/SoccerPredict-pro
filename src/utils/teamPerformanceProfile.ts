import { TeamStats } from '../types/soccer';

export interface TeamPerformanceProfile {
  lastSeasonRank: number; // 1 = Champion, 2 = 2nd, ..., 21 = Promoted
  lastSeasonStanding: string; // e.g. "1st (Champions)", "2nd", "3rd", "Promoted"
  lastSeasonPoints?: number;
  totalSquadValueEur: number; // in Millions of EUR (e.g. 1170 = €1.17B)
  avgMatchRating: number; // 6.40 - 7.35 scale (Opta / WhoScored style)
}

/**
 * Verified canonical team profiles reflecting:
 * 1. Final standing in the same competition last season (2023-24 season)
 * 2. Total squad market valuation (Transfermarkt / Opta valuations in €M)
 * 3. Average match performance rating across the season
 */
export const CANONICAL_TEAM_PROFILES: Record<string, TeamPerformanceProfile> = {
  // === ENGLISH PREMIER LEAGUE ===
  'manchester city': {
    lastSeasonRank: 1,
    lastSeasonStanding: '1st (Champions)',
    lastSeasonPoints: 91,
    totalSquadValueEur: 1260,
    avgMatchRating: 7.18,
  },
  'arsenal': {
    lastSeasonRank: 2,
    lastSeasonStanding: '2nd (Runners-up)',
    lastSeasonPoints: 89,
    totalSquadValueEur: 1170,
    avgMatchRating: 7.12,
  },
  'liverpool': {
    lastSeasonRank: 3,
    lastSeasonStanding: '3rd',
    lastSeasonPoints: 82,
    totalSquadValueEur: 930,
    avgMatchRating: 7.08,
  },
  'aston villa': {
    lastSeasonRank: 4,
    lastSeasonStanding: '4th',
    lastSeasonPoints: 68,
    totalSquadValueEur: 615,
    avgMatchRating: 6.98,
  },
  'tottenham': {
    lastSeasonRank: 5,
    lastSeasonStanding: '5th',
    lastSeasonPoints: 66,
    totalSquadValueEur: 770,
    avgMatchRating: 6.92,
  },
  'tottenham hotspur': {
    lastSeasonRank: 5,
    lastSeasonStanding: '5th',
    lastSeasonPoints: 66,
    totalSquadValueEur: 770,
    avgMatchRating: 6.92,
  },
  'chelsea': {
    lastSeasonRank: 6,
    lastSeasonStanding: '6th',
    lastSeasonPoints: 63,
    totalSquadValueEur: 960,
    avgMatchRating: 6.94,
  },
  'newcastle': {
    lastSeasonRank: 7,
    lastSeasonStanding: '7th',
    lastSeasonPoints: 60,
    totalSquadValueEur: 650,
    avgMatchRating: 6.90,
  },
  'newcastle united': {
    lastSeasonRank: 7,
    lastSeasonStanding: '7th',
    lastSeasonPoints: 60,
    totalSquadValueEur: 650,
    avgMatchRating: 6.90,
  },
  'manchester united': {
    lastSeasonRank: 8,
    lastSeasonStanding: '8th',
    lastSeasonPoints: 60,
    totalSquadValueEur: 850,
    avgMatchRating: 6.84,
  },
  'west ham': {
    lastSeasonRank: 9,
    lastSeasonStanding: '9th',
    lastSeasonPoints: 52,
    totalSquadValueEur: 475,
    avgMatchRating: 6.81,
  },
  'west ham united': {
    lastSeasonRank: 9,
    lastSeasonStanding: '9th',
    lastSeasonPoints: 52,
    totalSquadValueEur: 475,
    avgMatchRating: 6.81,
  },
  'crystal palace': {
    lastSeasonRank: 10,
    lastSeasonStanding: '10th',
    lastSeasonPoints: 49,
    totalSquadValueEur: 430,
    avgMatchRating: 6.83,
  },
  'brighton': {
    lastSeasonRank: 11,
    lastSeasonStanding: '11th',
    lastSeasonPoints: 48,
    totalSquadValueEur: 550,
    avgMatchRating: 6.84,
  },
  'brighton & hove albion': {
    lastSeasonRank: 11,
    lastSeasonStanding: '11th',
    lastSeasonPoints: 48,
    totalSquadValueEur: 550,
    avgMatchRating: 6.84,
  },
  'bournemouth': {
    lastSeasonRank: 12,
    lastSeasonStanding: '12th',
    lastSeasonPoints: 48,
    totalSquadValueEur: 360,
    avgMatchRating: 6.80,
  },
  'afc bournemouth': {
    lastSeasonRank: 12,
    lastSeasonStanding: '12th',
    lastSeasonPoints: 48,
    totalSquadValueEur: 360,
    avgMatchRating: 6.80,
  },
  'fulham': {
    lastSeasonRank: 13,
    lastSeasonStanding: '13th',
    lastSeasonPoints: 47,
    totalSquadValueEur: 345,
    avgMatchRating: 6.79,
  },
  'wolverhampton': {
    lastSeasonRank: 14,
    lastSeasonStanding: '14th',
    lastSeasonPoints: 46,
    totalSquadValueEur: 380,
    avgMatchRating: 6.76,
  },
  'wolves': {
    lastSeasonRank: 14,
    lastSeasonStanding: '14th',
    lastSeasonPoints: 46,
    totalSquadValueEur: 380,
    avgMatchRating: 6.76,
  },
  'everton': {
    lastSeasonRank: 15,
    lastSeasonStanding: '15th',
    lastSeasonPoints: 40,
    totalSquadValueEur: 350,
    avgMatchRating: 6.78,
  },
  'brentford': {
    lastSeasonRank: 16,
    lastSeasonStanding: '16th',
    lastSeasonPoints: 39,
    totalSquadValueEur: 410,
    avgMatchRating: 6.77,
  },
  'nottingham forest': {
    lastSeasonRank: 17,
    lastSeasonStanding: '17th',
    lastSeasonPoints: 32,
    totalSquadValueEur: 420,
    avgMatchRating: 6.74,
  },
  'leicester city': {
    lastSeasonRank: 21,
    lastSeasonStanding: 'Promoted (Championship 1st)',
    lastSeasonPoints: 97,
    totalSquadValueEur: 260,
    avgMatchRating: 6.72,
  },
  'ipswich town': {
    lastSeasonRank: 22,
    lastSeasonStanding: 'Promoted (Championship 2nd)',
    lastSeasonPoints: 96,
    totalSquadValueEur: 165,
    avgMatchRating: 6.68,
  },
  'southampton': {
    lastSeasonRank: 23,
    lastSeasonStanding: 'Promoted (Play-offs)',
    lastSeasonPoints: 87,
    totalSquadValueEur: 235,
    avgMatchRating: 6.69,
  },

  // === SPANISH LA LIGA ===
  'real madrid': {
    lastSeasonRank: 1,
    lastSeasonStanding: '1st (Champions)',
    lastSeasonPoints: 95,
    totalSquadValueEur: 1340,
    avgMatchRating: 7.22,
  },
  'barcelona': {
    lastSeasonRank: 2,
    lastSeasonStanding: '2nd (Runners-up)',
    lastSeasonPoints: 85,
    totalSquadValueEur: 940,
    avgMatchRating: 7.10,
  },
  'girona': {
    lastSeasonRank: 3,
    lastSeasonStanding: '3rd',
    lastSeasonPoints: 81,
    totalSquadValueEur: 215,
    avgMatchRating: 7.02,
  },
  'atletico madrid': {
    lastSeasonRank: 4,
    lastSeasonStanding: '4th',
    lastSeasonPoints: 76,
    totalSquadValueEur: 510,
    avgMatchRating: 6.96,
  },
  'athletic club': {
    lastSeasonRank: 5,
    lastSeasonStanding: '5th',
    lastSeasonPoints: 68,
    totalSquadValueEur: 340,
    avgMatchRating: 6.92,
  },
  'athletic bilbao': {
    lastSeasonRank: 5,
    lastSeasonStanding: '5th',
    lastSeasonPoints: 68,
    totalSquadValueEur: 340,
    avgMatchRating: 6.92,
  },
  'real sociedad': {
    lastSeasonRank: 6,
    lastSeasonStanding: '6th',
    lastSeasonPoints: 60,
    totalSquadValueEur: 430,
    avgMatchRating: 6.90,
  },
  'real betis': {
    lastSeasonRank: 7,
    lastSeasonStanding: '7th',
    lastSeasonPoints: 57,
    totalSquadValueEur: 190,
    avgMatchRating: 6.84,
  },
  'villarreal': {
    lastSeasonRank: 8,
    lastSeasonStanding: '8th',
    lastSeasonPoints: 53,
    totalSquadValueEur: 230,
    avgMatchRating: 6.85,
  },
  'valencia': {
    lastSeasonRank: 9,
    lastSeasonStanding: '9th',
    lastSeasonPoints: 49,
    totalSquadValueEur: 220,
    avgMatchRating: 6.78,
  },
  'deportivo alaves': {
    lastSeasonRank: 10,
    lastSeasonStanding: '10th',
    lastSeasonPoints: 46,
    totalSquadValueEur: 85,
    avgMatchRating: 6.75,
  },
  'alaves': {
    lastSeasonRank: 10,
    lastSeasonStanding: '10th',
    lastSeasonPoints: 46,
    totalSquadValueEur: 85,
    avgMatchRating: 6.75,
  },
  'osasuna': {
    lastSeasonRank: 11,
    lastSeasonStanding: '11th',
    lastSeasonPoints: 45,
    totalSquadValueEur: 115,
    avgMatchRating: 6.77,
  },
  'getafe': {
    lastSeasonRank: 12,
    lastSeasonStanding: '12th',
    lastSeasonPoints: 43,
    totalSquadValueEur: 75,
    avgMatchRating: 6.72,
  },
  'celta vigo': {
    lastSeasonRank: 13,
    lastSeasonStanding: '13th',
    lastSeasonPoints: 41,
    totalSquadValueEur: 115,
    avgMatchRating: 6.76,
  },
  'sevilla': {
    lastSeasonRank: 14,
    lastSeasonStanding: '14th',
    lastSeasonPoints: 41,
    totalSquadValueEur: 180,
    avgMatchRating: 6.79,
  },
  'mallorca': {
    lastSeasonRank: 15,
    lastSeasonStanding: '15th',
    lastSeasonPoints: 40,
    totalSquadValueEur: 95,
    avgMatchRating: 6.74,
  },
  'las palmas': {
    lastSeasonRank: 16,
    lastSeasonStanding: '16th',
    lastSeasonPoints: 40,
    totalSquadValueEur: 110,
    avgMatchRating: 6.71,
  },
  'rayo vallecano': {
    lastSeasonRank: 17,
    lastSeasonStanding: '17th',
    lastSeasonPoints: 38,
    totalSquadValueEur: 75,
    avgMatchRating: 6.70,
  },
  'leganes': {
    lastSeasonRank: 21,
    lastSeasonStanding: 'Promoted (Segunda 1st)',
    lastSeasonPoints: 74,
    totalSquadValueEur: 60,
    avgMatchRating: 6.68,
  },
  'real valladolid': {
    lastSeasonRank: 22,
    lastSeasonStanding: 'Promoted (Segunda 2nd)',
    lastSeasonPoints: 72,
    totalSquadValueEur: 55,
    avgMatchRating: 6.66,
  },
  'espanyol': {
    lastSeasonRank: 23,
    lastSeasonStanding: 'Promoted (Play-offs)',
    lastSeasonPoints: 69,
    totalSquadValueEur: 70,
    avgMatchRating: 6.67,
  },

  // === GERMAN BUNDESLIGA ===
  'bayer leverkusen': {
    lastSeasonRank: 1,
    lastSeasonStanding: '1st (Champions - Invincible)',
    lastSeasonPoints: 90,
    totalSquadValueEur: 625,
    avgMatchRating: 7.15,
  },
  'stuttgart': {
    lastSeasonRank: 2,
    lastSeasonStanding: '2nd (Runners-up)',
    lastSeasonPoints: 73,
    totalSquadValueEur: 310,
    avgMatchRating: 7.04,
  },
  'vfb stuttgart': {
    lastSeasonRank: 2,
    lastSeasonStanding: '2nd (Runners-up)',
    lastSeasonPoints: 73,
    totalSquadValueEur: 310,
    avgMatchRating: 7.04,
  },
  'bayern munich': {
    lastSeasonRank: 3,
    lastSeasonStanding: '3rd',
    lastSeasonPoints: 72,
    totalSquadValueEur: 940,
    avgMatchRating: 7.12,
  },
  'fc bayern munchen': {
    lastSeasonRank: 3,
    lastSeasonStanding: '3rd',
    lastSeasonPoints: 72,
    totalSquadValueEur: 940,
    avgMatchRating: 7.12,
  },
  'rb leipzig': {
    lastSeasonRank: 4,
    lastSeasonStanding: '4th',
    lastSeasonPoints: 65,
    totalSquadValueEur: 515,
    avgMatchRating: 6.98,
  },
  'borussia dortmund': {
    lastSeasonRank: 5,
    lastSeasonStanding: '5th',
    lastSeasonPoints: 63,
    totalSquadValueEur: 465,
    avgMatchRating: 6.92,
  },
  'eintracht frankfurt': {
    lastSeasonRank: 6,
    lastSeasonStanding: '6th',
    lastSeasonPoints: 47,
    totalSquadValueEur: 280,
    avgMatchRating: 6.84,
  },
  'hoffenheim': {
    lastSeasonRank: 7,
    lastSeasonStanding: '7th',
    lastSeasonPoints: 46,
    totalSquadValueEur: 165,
    avgMatchRating: 6.80,
  },
  'heidenheim': {
    lastSeasonRank: 8,
    lastSeasonStanding: '8th',
    lastSeasonPoints: 42,
    totalSquadValueEur: 65,
    avgMatchRating: 6.79,
  },
  'werder bremen': {
    lastSeasonRank: 9,
    lastSeasonStanding: '9th',
    lastSeasonPoints: 42,
    totalSquadValueEur: 125,
    avgMatchRating: 6.77,
  },
  'freiburg': {
    lastSeasonRank: 10,
    lastSeasonStanding: '10th',
    lastSeasonPoints: 42,
    totalSquadValueEur: 175,
    avgMatchRating: 6.78,
  },
  'augsburg': {
    lastSeasonRank: 11,
    lastSeasonStanding: '11th',
    lastSeasonPoints: 39,
    totalSquadValueEur: 110,
    avgMatchRating: 6.76,
  },
  'wolfsburg': {
    lastSeasonRank: 12,
    lastSeasonStanding: '12th',
    lastSeasonPoints: 37,
    totalSquadValueEur: 215,
    avgMatchRating: 6.75,
  },
  'mainz 05': {
    lastSeasonRank: 13,
    lastSeasonStanding: '13th',
    lastSeasonPoints: 35,
    totalSquadValueEur: 115,
    avgMatchRating: 6.74,
  },
  'borussia monchengladbach': {
    lastSeasonRank: 14,
    lastSeasonStanding: '14th',
    lastSeasonPoints: 34,
    totalSquadValueEur: 155,
    avgMatchRating: 6.73,
  },
  'union berlin': {
    lastSeasonRank: 15,
    lastSeasonStanding: '15th',
    lastSeasonPoints: 33,
    totalSquadValueEur: 130,
    avgMatchRating: 6.71,
  },
  'vfl bochum': {
    lastSeasonRank: 16,
    lastSeasonStanding: '16th (Play-off winner)',
    lastSeasonPoints: 33,
    totalSquadValueEur: 65,
    avgMatchRating: 6.69,
  },
  'fc st. pauli': {
    lastSeasonRank: 21,
    lastSeasonStanding: 'Promoted (2. Bundesliga 1st)',
    lastSeasonPoints: 69,
    totalSquadValueEur: 45,
    avgMatchRating: 6.68,
  },
  'holstein kiel': {
    lastSeasonRank: 22,
    lastSeasonStanding: 'Promoted (2. Bundesliga 2nd)',
    lastSeasonPoints: 68,
    totalSquadValueEur: 38,
    avgMatchRating: 6.66,
  },

  // === ITALIAN SERIE A ===
  'inter': {
    lastSeasonRank: 1,
    lastSeasonStanding: '1st (Champions)',
    lastSeasonPoints: 94,
    totalSquadValueEur: 670,
    avgMatchRating: 7.14,
  },
  'inter milan': {
    lastSeasonRank: 1,
    lastSeasonStanding: '1st (Champions)',
    lastSeasonPoints: 94,
    totalSquadValueEur: 670,
    avgMatchRating: 7.14,
  },
  'ac milan': {
    lastSeasonRank: 2,
    lastSeasonStanding: '2nd (Runners-up)',
    lastSeasonPoints: 75,
    totalSquadValueEur: 560,
    avgMatchRating: 6.98,
  },
  'juventus': {
    lastSeasonRank: 3,
    lastSeasonStanding: '3rd',
    lastSeasonPoints: 71,
    totalSquadValueEur: 595,
    avgMatchRating: 6.95,
  },
  'atalanta': {
    lastSeasonRank: 4,
    lastSeasonStanding: '4th',
    lastSeasonPoints: 69,
    totalSquadValueEur: 440,
    avgMatchRating: 6.97,
  },
  'bologna': {
    lastSeasonRank: 5,
    lastSeasonStanding: '5th',
    lastSeasonPoints: 68,
    totalSquadValueEur: 280,
    avgMatchRating: 6.91,
  },
  'roma': {
    lastSeasonRank: 6,
    lastSeasonStanding: '6th',
    lastSeasonPoints: 63,
    totalSquadValueEur: 335,
    avgMatchRating: 6.88,
  },
  'as roma': {
    lastSeasonRank: 6,
    lastSeasonStanding: '6th',
    lastSeasonPoints: 63,
    totalSquadValueEur: 335,
    avgMatchRating: 6.88,
  },
  'lazio': {
    lastSeasonRank: 7,
    lastSeasonStanding: '7th',
    lastSeasonPoints: 61,
    totalSquadValueEur: 240,
    avgMatchRating: 6.85,
  },
  'fiorentina': {
    lastSeasonRank: 8,
    lastSeasonStanding: '8th',
    lastSeasonPoints: 60,
    totalSquadValueEur: 270,
    avgMatchRating: 6.83,
  },
  'torino': {
    lastSeasonRank: 9,
    lastSeasonStanding: '9th',
    lastSeasonPoints: 53,
    totalSquadValueEur: 180,
    avgMatchRating: 6.80,
  },
  'napoli': {
    lastSeasonRank: 10,
    lastSeasonStanding: '10th',
    lastSeasonPoints: 53,
    totalSquadValueEur: 430,
    avgMatchRating: 6.86,
  },
  'genoa': {
    lastSeasonRank: 11,
    lastSeasonStanding: '11th',
    lastSeasonPoints: 49,
    totalSquadValueEur: 150,
    avgMatchRating: 6.77,
  },
  'monza': {
    lastSeasonRank: 12,
    lastSeasonStanding: '12th',
    lastSeasonPoints: 45,
    totalSquadValueEur: 110,
    avgMatchRating: 6.74,
  },
  'hellas verona': {
    lastSeasonRank: 13,
    lastSeasonStanding: '13th',
    lastSeasonPoints: 38,
    totalSquadValueEur: 80,
    avgMatchRating: 6.72,
  },
  'lecce': {
    lastSeasonRank: 14,
    lastSeasonStanding: '14th',
    lastSeasonPoints: 38,
    totalSquadValueEur: 95,
    avgMatchRating: 6.71,
  },
  'udinese': {
    lastSeasonRank: 15,
    lastSeasonStanding: '15th',
    lastSeasonPoints: 37,
    totalSquadValueEur: 130,
    avgMatchRating: 6.73,
  },
  'cagliari': {
    lastSeasonRank: 16,
    lastSeasonStanding: '16th',
    lastSeasonPoints: 36,
    totalSquadValueEur: 85,
    avgMatchRating: 6.70,
  },
  'empoli': {
    lastSeasonRank: 17,
    lastSeasonStanding: '17th',
    lastSeasonPoints: 36,
    totalSquadValueEur: 75,
    avgMatchRating: 6.69,
  },
  'parma': {
    lastSeasonRank: 21,
    lastSeasonStanding: 'Promoted (Serie B 1st)',
    lastSeasonPoints: 76,
    totalSquadValueEur: 120,
    avgMatchRating: 6.72,
  },
  'como': {
    lastSeasonRank: 22,
    lastSeasonStanding: 'Promoted (Serie B 2nd)',
    lastSeasonPoints: 73,
    totalSquadValueEur: 105,
    avgMatchRating: 6.71,
  },
  'venezia': {
    lastSeasonRank: 23,
    lastSeasonStanding: 'Promoted (Play-offs)',
    lastSeasonPoints: 70,
    totalSquadValueEur: 65,
    avgMatchRating: 6.68,
  },

  // === FRENCH LIGUE 1 ===
  'paris saint-germain': {
    lastSeasonRank: 1,
    lastSeasonStanding: '1st (Champions)',
    lastSeasonPoints: 76,
    totalSquadValueEur: 890,
    avgMatchRating: 7.10,
  },
  'psg': {
    lastSeasonRank: 1,
    lastSeasonStanding: '1st (Champions)',
    lastSeasonPoints: 76,
    totalSquadValueEur: 890,
    avgMatchRating: 7.10,
  },
  'monaco': {
    lastSeasonRank: 2,
    lastSeasonStanding: '2nd (Runners-up)',
    lastSeasonPoints: 67,
    totalSquadValueEur: 350,
    avgMatchRating: 6.96,
  },
  'as monaco': {
    lastSeasonRank: 2,
    lastSeasonStanding: '2nd (Runners-up)',
    lastSeasonPoints: 67,
    totalSquadValueEur: 350,
    avgMatchRating: 6.96,
  },
  'brest': {
    lastSeasonRank: 3,
    lastSeasonStanding: '3rd',
    lastSeasonPoints: 61,
    totalSquadValueEur: 125,
    avgMatchRating: 6.89,
  },
  'lille': {
    lastSeasonRank: 4,
    lastSeasonStanding: '4th',
    lastSeasonPoints: 59,
    totalSquadValueEur: 275,
    avgMatchRating: 6.91,
  },
  'nice': {
    lastSeasonRank: 5,
    lastSeasonStanding: '5th',
    lastSeasonPoints: 55,
    totalSquadValueEur: 220,
    avgMatchRating: 6.87,
  },
  'lyon': {
    lastSeasonRank: 6,
    lastSeasonStanding: '6th',
    lastSeasonPoints: 53,
    totalSquadValueEur: 260,
    avgMatchRating: 6.86,
  },
  'olympique lyonnais': {
    lastSeasonRank: 6,
    lastSeasonStanding: '6th',
    lastSeasonPoints: 53,
    totalSquadValueEur: 260,
    avgMatchRating: 6.86,
  },
  'lens': {
    lastSeasonRank: 7,
    lastSeasonStanding: '7th',
    lastSeasonPoints: 51,
    totalSquadValueEur: 180,
    avgMatchRating: 6.83,
  },
  'marseille': {
    lastSeasonRank: 8,
    lastSeasonStanding: '8th',
    lastSeasonPoints: 50,
    totalSquadValueEur: 320,
    avgMatchRating: 6.88,
  },
  'olympique de marseille': {
    lastSeasonRank: 8,
    lastSeasonStanding: '8th',
    lastSeasonPoints: 50,
    totalSquadValueEur: 320,
    avgMatchRating: 6.88,
  },

  // === DUTCH & PORTUGUESE & SCOTTISH & SOUTH AFRICAN & SWISS ===
  'psv': {
    lastSeasonRank: 1,
    lastSeasonStanding: '1st (Champions)',
    lastSeasonPoints: 91,
    totalSquadValueEur: 320,
    avgMatchRating: 7.05,
  },
  'psv eindhoven': {
    lastSeasonRank: 1,
    lastSeasonStanding: '1st (Champions)',
    lastSeasonPoints: 91,
    totalSquadValueEur: 320,
    avgMatchRating: 7.05,
  },
  'feyenoord': {
    lastSeasonRank: 2,
    lastSeasonStanding: '2nd',
    lastSeasonPoints: 84,
    totalSquadValueEur: 285,
    avgMatchRating: 6.96,
  },
  'ajax': {
    lastSeasonRank: 5,
    lastSeasonStanding: '5th',
    lastSeasonPoints: 56,
    totalSquadValueEur: 230,
    avgMatchRating: 6.84,
  },
  'sporting cp': {
    lastSeasonRank: 1,
    lastSeasonStanding: '1st (Champions)',
    lastSeasonPoints: 90,
    totalSquadValueEur: 400,
    avgMatchRating: 7.08,
  },
  'benfica': {
    lastSeasonRank: 2,
    lastSeasonStanding: '2nd',
    lastSeasonPoints: 80,
    totalSquadValueEur: 335,
    avgMatchRating: 7.02,
  },
  'porto': {
    lastSeasonRank: 3,
    lastSeasonStanding: '3rd',
    lastSeasonPoints: 72,
    totalSquadValueEur: 280,
    avgMatchRating: 6.98,
  },
  'celtic': {
    lastSeasonRank: 1,
    lastSeasonStanding: '1st (Champions)',
    lastSeasonPoints: 93,
    totalSquadValueEur: 125,
    avgMatchRating: 7.04,
  },
  'rangers': {
    lastSeasonRank: 2,
    lastSeasonStanding: '2nd',
    lastSeasonPoints: 85,
    totalSquadValueEur: 98,
    avgMatchRating: 6.94,
  },
  'mamelodi sundowns': {
    lastSeasonRank: 1,
    lastSeasonStanding: '1st (Champions)',
    lastSeasonPoints: 73,
    totalSquadValueEur: 38,
    avgMatchRating: 7.12,
  },
  'orlando pirates': {
    lastSeasonRank: 2,
    lastSeasonStanding: '2nd (Nedbank Cup Champions)',
    lastSeasonPoints: 50,
    totalSquadValueEur: 24,
    avgMatchRating: 6.96,
  },
  'stellenbosch': {
    lastSeasonRank: 3,
    lastSeasonStanding: '3rd',
    lastSeasonPoints: 50,
    totalSquadValueEur: 12,
    avgMatchRating: 6.85,
  },
  'young boys': {
    lastSeasonRank: 1,
    lastSeasonStanding: '1st (Champions)',
    lastSeasonPoints: 77,
    totalSquadValueEur: 68,
    avgMatchRating: 7.05,
  },
  'fc basel': {
    lastSeasonRank: 8,
    lastSeasonStanding: '8th',
    lastSeasonPoints: 49,
    totalSquadValueEur: 54,
    avgMatchRating: 6.82,
  },
  'fc luzern': {
    lastSeasonRank: 7,
    lastSeasonStanding: '7th',
    lastSeasonPoints: 49,
    totalSquadValueEur: 28,
    avgMatchRating: 6.78,
  },
  'fc sion': {
    lastSeasonRank: 21,
    lastSeasonStanding: 'Promoted (Challenge League 1st)',
    lastSeasonPoints: 79,
    totalSquadValueEur: 18,
    avgMatchRating: 6.70,
  },
  'fc thun': {
    lastSeasonRank: 22,
    lastSeasonStanding: '2nd (Challenge League)',
    lastSeasonPoints: 76,
    totalSquadValueEur: 14,
    avgMatchRating: 6.68,
  },
  'lausanne sports': {
    lastSeasonRank: 10,
    lastSeasonStanding: '10th',
    lastSeasonPoints: 45,
    totalSquadValueEur: 22,
    avgMatchRating: 6.72,
  },

  // === INTERNATIONAL / NATIONAL TEAMS ===
  'argentina': {
    lastSeasonRank: 1,
    lastSeasonStanding: '1st (World & Copa Champions)',
    totalSquadValueEur: 850,
    avgMatchRating: 7.18,
  },
  'brazil': {
    lastSeasonRank: 3,
    lastSeasonStanding: '3rd (CONMEBOL)',
    totalSquadValueEur: 940,
    avgMatchRating: 7.06,
  },
  'uruguay': {
    lastSeasonRank: 2,
    lastSeasonStanding: '2nd (CONMEBOL)',
    totalSquadValueEur: 480,
    avgMatchRating: 7.04,
  },
  'colombia': {
    lastSeasonRank: 4,
    lastSeasonStanding: '4th (Copa Finalist)',
    totalSquadValueEur: 310,
    avgMatchRating: 7.02,
  },
  'ecuador': {
    lastSeasonRank: 5,
    lastSeasonStanding: '5th (CONMEBOL)',
    totalSquadValueEur: 260,
    avgMatchRating: 6.90,
  },
  'venezuela': {
    lastSeasonRank: 7,
    lastSeasonStanding: '7th (CONMEBOL)',
    totalSquadValueEur: 75,
    avgMatchRating: 6.82,
  },
  'paraguay': {
    lastSeasonRank: 8,
    lastSeasonStanding: '8th (CONMEBOL)',
    totalSquadValueEur: 125,
    avgMatchRating: 6.78,
  },
  'chile': {
    lastSeasonRank: 6,
    lastSeasonStanding: '6th (CONMEBOL)',
    totalSquadValueEur: 85,
    avgMatchRating: 6.76,
  },
  'peru': {
    lastSeasonRank: 9,
    lastSeasonStanding: '9th (CONMEBOL)',
    totalSquadValueEur: 45,
    avgMatchRating: 6.70,
  },
  'bolivia': {
    lastSeasonRank: 10,
    lastSeasonStanding: '10th (CONMEBOL)',
    totalSquadValueEur: 18,
    avgMatchRating: 6.64,
  },

  // === SAUDI PRO LEAGUE ===
  'al ittihad': {
    lastSeasonRank: 5,
    lastSeasonStanding: '5th',
    lastSeasonPoints: 54,
    totalSquadValueEur: 165,
    avgMatchRating: 7.15,
  },
  'al-ittihad': {
    lastSeasonRank: 5,
    lastSeasonStanding: '5th',
    lastSeasonPoints: 54,
    totalSquadValueEur: 165,
    avgMatchRating: 7.15,
  },
  'al faisaly': {
    lastSeasonRank: 21,
    lastSeasonStanding: 'Promoted',
    lastSeasonPoints: 53,
    totalSquadValueEur: 14,
    avgMatchRating: 6.62,
  },
  'al hilal': {
    lastSeasonRank: 1,
    lastSeasonStanding: '1st (Champions)',
    lastSeasonPoints: 96,
    totalSquadValueEur: 245,
    avgMatchRating: 7.28,
  },
  'al nassr': {
    lastSeasonRank: 2,
    lastSeasonStanding: '2nd (Runners-up)',
    lastSeasonPoints: 82,
    totalSquadValueEur: 190,
    avgMatchRating: 7.18,
  },
  'al ahli': {
    lastSeasonRank: 3,
    lastSeasonStanding: '3rd',
    lastSeasonPoints: 65,
    totalSquadValueEur: 175,
    avgMatchRating: 7.08,
  },
  'al qadsiah': {
    lastSeasonRank: 21,
    lastSeasonStanding: 'Promoted',
    lastSeasonPoints: 73,
    totalSquadValueEur: 70,
    avgMatchRating: 6.94,
  },
  'al ettifaq': {
    lastSeasonRank: 6,
    lastSeasonStanding: '6th',
    lastSeasonPoints: 48,
    totalSquadValueEur: 62,
    avgMatchRating: 6.84,
  },
  'al hazem': {
    lastSeasonRank: 18,
    lastSeasonStanding: '18th',
    lastSeasonPoints: 24,
    totalSquadValueEur: 16,
    avgMatchRating: 6.64,
  },
};

export const WOMEN_TEAM_PROFILES: Record<string, TeamPerformanceProfile> = {
  'sporting cp': {
    lastSeasonRank: 2,
    lastSeasonStanding: '2nd (Runners-up)',
    lastSeasonPoints: 54,
    totalSquadValueEur: 2.4, // €2.4M
    avgMatchRating: 7.02,
  },
  'sl benfica': {
    lastSeasonRank: 1,
    lastSeasonStanding: '1st (Champions)',
    lastSeasonPoints: 56,
    totalSquadValueEur: 3.8, // €3.8M
    avgMatchRating: 7.15,
  },
  'benfica': {
    lastSeasonRank: 1,
    lastSeasonStanding: '1st (Champions)',
    lastSeasonPoints: 56,
    totalSquadValueEur: 3.8,
    avgMatchRating: 7.15,
  },
  'cs maritimo madeira': {
    lastSeasonRank: 9,
    lastSeasonStanding: '9th',
    lastSeasonPoints: 21,
    totalSquadValueEur: 0.75, // €750K
    avgMatchRating: 6.62,
  },
  'maritimo': {
    lastSeasonRank: 9,
    lastSeasonStanding: '9th',
    lastSeasonPoints: 21,
    totalSquadValueEur: 0.75,
    avgMatchRating: 6.62,
  },
  'rio ave fc': {
    lastSeasonRank: 10,
    lastSeasonStanding: '10th',
    lastSeasonPoints: 17,
    totalSquadValueEur: 0.60,
    avgMatchRating: 6.55,
  },
  'fc barcelona': {
    lastSeasonRank: 1,
    lastSeasonStanding: '1st (Champions)',
    lastSeasonPoints: 88,
    totalSquadValueEur: 5.5, // €5.5M
    avgMatchRating: 7.28,
  },
  'barcelona': {
    lastSeasonRank: 1,
    lastSeasonStanding: '1st (Champions)',
    lastSeasonPoints: 88,
    totalSquadValueEur: 5.5,
    avgMatchRating: 7.28,
  },
  'deportivo alaves': {
    lastSeasonRank: 8,
    lastSeasonStanding: '8th',
    lastSeasonPoints: 32,
    totalSquadValueEur: 0.85,
    avgMatchRating: 6.65,
  },
  'chelsea': {
    lastSeasonRank: 1,
    lastSeasonStanding: '1st (Champions)',
    lastSeasonPoints: 55,
    totalSquadValueEur: 4.8,
    avgMatchRating: 7.20,
  },
  'arsenal': {
    lastSeasonRank: 2,
    lastSeasonStanding: '2nd (Runners-up)',
    lastSeasonPoints: 50,
    totalSquadValueEur: 4.2,
    avgMatchRating: 7.12,
  },
  'racing club': {
    lastSeasonRank: 3,
    lastSeasonStanding: '3rd',
    lastSeasonPoints: 36,
    totalSquadValueEur: 0.70,
    avgMatchRating: 6.75,
  },
  'ca banfield': {
    lastSeasonRank: 7,
    lastSeasonStanding: '7th',
    lastSeasonPoints: 24,
    totalSquadValueEur: 0.50,
    avgMatchRating: 6.58,
  },
  'al-ahli jeddah (w)': {
    lastSeasonRank: 2,
    lastSeasonStanding: '2nd',
    lastSeasonPoints: 35,
    totalSquadValueEur: 0.90,
    avgMatchRating: 6.80,
  },
  'al hilal riyadh (w)': {
    lastSeasonRank: 3,
    lastSeasonStanding: '3rd',
    lastSeasonPoints: 32,
    totalSquadValueEur: 0.85,
    avgMatchRating: 6.78,
  },
};

/**
 * Resolves or derives a consistent TeamPerformanceProfile for any team.
 * Priority:
 * 1. Explicit properties on team (team.lastSeasonRank, team.totalSquadValueEur, team.avgMatchRating)
 * 2. Dedicated women's profile (for women's competitions) or canonical database lookup
 * 3. Contextual dynamic calculation based on table rank, possession, shots, and league tier
 */
export function resolveTeamPerformanceProfile(
  team?: Partial<TeamStats> & { name?: string; leagueRank?: number; points?: number; avgPossession?: number; avgShotsOnTarget?: number },
  league?: string
): TeamPerformanceProfile {
  if (!team) {
    return {
      lastSeasonRank: 10,
      lastSeasonStanding: '10th',
      totalSquadValueEur: 200,
      avgMatchRating: 6.85,
    };
  }

  const normName = (team.name || '').toLowerCase().trim();
  const leagueStr = (league || '').toLowerCase();

  // Category classification to prevent cross-contamination (e.g. senior men values on women/youth/amateur)
  const isWomen =
    /women|femenin|femenil|feminino|frauen|dames|\(w\)/i.test(leagueStr) ||
    /\(w\)/i.test(normName);
  const isYouthOrReserve =
    /u18|u19|u20|u21|u23|reserve|youth|development league/i.test(leagueStr) ||
    /u18|u19|u20|u21|reserve/i.test(normName);
  const isAmateurOrLowerTier =
    /amateur|tercera|division 2|4th league|regional|oberliga|landesliga|burgenlandliga|national 2|national 3|iii liga|sammarinese|san marino|campeonato de portugal|liga 3/i.test(leagueStr);

  // If all three are already explicitly provided on the team object
  if (
    team.lastSeasonRank !== undefined &&
    team.totalSquadValueEur !== undefined &&
    team.avgMatchRating !== undefined
  ) {
    return {
      lastSeasonRank: team.lastSeasonRank,
      lastSeasonStanding: team.lastSeasonStanding || formatOrdinalStanding(team.lastSeasonRank),
      lastSeasonPoints: team.lastSeasonPoints,
      totalSquadValueEur: team.totalSquadValueEur,
      avgMatchRating: team.avgMatchRating,
    };
  }

  let profile: TeamPerformanceProfile | undefined;

  if (isWomen) {
    // Check dedicated women's database
    profile = WOMEN_TEAM_PROFILES[normName];
    if (!profile) {
      for (const [key, val] of Object.entries(WOMEN_TEAM_PROFILES)) {
        if (normName.includes(key) || key.includes(normName)) {
          profile = val;
          break;
        }
      }
    }
  } else if (!isYouthOrReserve && !isAmateurOrLowerTier) {
    // Only check senior men's database for senior professional competitions
    profile = CANONICAL_TEAM_PROFILES[normName];
    if (!profile) {
      for (const [key, val] of Object.entries(CANONICAL_TEAM_PROFILES)) {
        if (normName.includes(key) || key.includes(normName)) {
          profile = val;
          break;
        }
      }
    }
  }

  const currentRank = team.leagueRank || 10;
  const currentPossession = team.avgPossession || 50;
  const currentSot = team.avgShotsOnTarget || 4.5;

  // Derive last season rank if missing
  const lastSeasonRank =
    team.lastSeasonRank ??
    (profile ? profile.lastSeasonRank : Math.min(20, Math.max(1, currentRank)));

  const lastSeasonStanding =
    team.lastSeasonStanding ??
    (profile ? profile.lastSeasonStanding : formatOrdinalStanding(lastSeasonRank));

  // Determine baseline squad value if missing
  let totalSquadValueEur = team.totalSquadValueEur;
  if (totalSquadValueEur === undefined) {
    if (profile) {
      totalSquadValueEur = profile.totalSquadValueEur;
    } else if (isWomen) {
      // Realistic top-tier women's team baseline (€0.5M - €2.5M)
      const baseValuation = 2.0;
      const rankDecay = Math.max(0.25, 1 - (currentRank - 1) * 0.06);
      totalSquadValueEur = Math.round(baseValuation * rankDecay * 100) / 100;
    } else if (isYouthOrReserve) {
      // Realistic youth / reserve squad baseline (€0.8M - €4.0M)
      const baseValuation = 3.5;
      const rankDecay = Math.max(0.25, 1 - (currentRank - 1) * 0.05);
      totalSquadValueEur = Math.round(baseValuation * rankDecay * 10) / 10;
    } else if (isAmateurOrLowerTier) {
      // Realistic regional / amateur baseline (€0.2M - €1.2M)
      const baseValuation = 0.9;
      const rankDecay = Math.max(0.20, 1 - (currentRank - 1) * 0.055);
      totalSquadValueEur = Math.round(baseValuation * rankDecay * 100) / 100;
    } else {
      // Senior professional leagues
      const isTop5League =
        league &&
        /premier league|la liga|serie a|bundesliga|ligue 1/i.test(league);
      const isMinorTier =
        league &&
        /faroe|jordan|iraq|malta|wales|ireland|iceland|algeria|san marino|paraguay/i.test(league);
      const isSecondTier =
        league &&
        /championship|serie b|2\. bundesliga|ligue 2|eerste|segunda|challenge league/i.test(league);

      const baseValuation = isTop5League ? 450 : isSecondTier ? 35 : isMinorTier ? 6 : 95;
      const rankDecay = Math.max(0.18, 1 - (currentRank - 1) * 0.045);
      totalSquadValueEur = Math.round(baseValuation * rankDecay);
    }
  }

  // Determine average match rating if missing
  let avgMatchRating = team.avgMatchRating;
  if (avgMatchRating === undefined) {
    if (profile) {
      avgMatchRating = profile.avgMatchRating;
    } else {
      const posContribution = (currentPossession / 100) * 0.45;
      const sotContribution = Math.min(0.40, (currentSot / 10) * 0.45);
      const rankContribution = Math.max(0, (20 - currentRank) * 0.015);
      const calculated = 6.45 + posContribution + sotContribution + rankContribution;
      avgMatchRating = Math.round(Math.min(7.35, Math.max(6.45, calculated)) * 100) / 100;
    }
  }

  return {
    lastSeasonRank,
    lastSeasonStanding,
    lastSeasonPoints: team.lastSeasonPoints ?? (profile ? profile.lastSeasonPoints : undefined),
    totalSquadValueEur,
    avgMatchRating,
  };
}

/**
 * Formats a squad market value in millions of EUR to clean readable string (e.g. €1.26B, €350M, €2.4M, or €750K)
 */
export function formatSquadValue(millions: number): string {
  if (millions >= 1000) {
    return `€${(millions / 1000).toFixed(2)}B`;
  }
  if (millions < 1) {
    return `€${Math.round(millions * 1000)}K`;
  }
  if (millions < 10) {
    return `€${millions.toFixed(1)}M`;
  }
  return `€${Math.round(millions)}M`;
}

/**
 * Helper to format ordinal standing string
 */
export function formatOrdinalStanding(rank: number): string {
  if (rank === 1) return '1st (Champions)';
  if (rank === 2) return '2nd (Runners-up)';
  if (rank === 3) return '3rd';
  if (rank >= 21) return 'Promoted';
  const j = rank % 10;
  const k = rank % 100;
  if (j === 1 && k !== 11) return `${rank}st`;
  if (j === 2 && k !== 12) return `${rank}nd`;
  if (j === 3 && k !== 13) return `${rank}rd`;
  return `${rank}th`;
}
