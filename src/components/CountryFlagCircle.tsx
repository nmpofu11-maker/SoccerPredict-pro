import React, { useState } from 'react';

// ISO 3166-1 alpha-2 mapping for countries/regions
const COUNTRY_CODE_MAP: Record<string, string> = {
  'South Africa': 'za',
  'Nigeria': 'ng',
  'Israel': 'il',
  'Egypt': 'eg',
  'Ghana': 'gh',
  'Morocco': 'ma',
  'Algeria': 'dz',
  'Tunisia': 'tn',
  'Cameroon': 'cm',
  'Ivory Coast': 'ci',
  'Senegal': 'sn',
  'Kenya': 'ke',
  'Zambia': 'zm',
  'Tanzania': 'tz',
  'Uganda': 'ug',
  'Jordan': 'jo',
  'Saudi Arabia': 'sa',
  'UAE': 'ae',
  'Qatar': 'qa',
  'Oman': 'om',
  'Kuwait': 'kw',
  'Bahrain': 'bh',
  'England': 'gb-eng',
  'Scotland': 'gb-sct',
  'Spain': 'es',
  'Germany': 'de',
  'Italy': 'it',
  'France': 'fr',
  'Netherlands': 'nl',
  'Portugal': 'pt',
  'Brazil': 'br',
  'Argentina': 'ar',
  'USA/Canada': 'us',
  'USA': 'us',
  'Japan': 'jp',
  'Switzerland': 'ch',
  'Austria': 'at',
  'Belgium': 'be',
  'Turkey': 'tr',
  'Denmark': 'dk',
  'Sweden': 'se',
  'Norway': 'no',
  'Greece': 'gr',
  'Mexico': 'mx',
  'Colombia': 'co',
  'Chile': 'cl',
  'Bolivia': 'bo',
  'Ecuador': 'ec',
  'Paraguay': 'py',
  'Uruguay': 'uy',
  'China': 'cn',
  'Australia': 'au',
  'South Korea': 'kr',
  'Croatia': 'hr',
  'Ireland': 'ie',
  'Romania': 'ro',
  'Latvia': 'lv',
  'Estonia': 'ee',
  'North Macedonia': 'mk',
  'Slovakia': 'sk',
  'San Marino': 'sm',
  'Myanmar': 'mm',
  'Thailand': 'th',
  'Vietnam': 'vn',
  'Malaysia': 'my',
  'Europe': 'eu',
  // Continental or Global
  'Africa': '',
  'South America': '',
  'Global': '',
};

export function getCountryCode(countryName?: string, leagueName?: string): string | null {
  // 1. Direct countryName lookup
  if (countryName && countryName !== 'Global') {
    const direct = COUNTRY_CODE_MAP[countryName];
    if (direct) return direct;

    const lower = countryName.toLowerCase().trim();
    for (const [k, v] of Object.entries(COUNTRY_CODE_MAP)) {
      if (k.toLowerCase() === lower && v) {
        return v;
      }
    }
  }

  // 2. Parse from league prefix e.g. "Nigeria • Premier League"
  if (leagueName) {
    if (leagueName.includes('•')) {
      const prefix = leagueName.split('•')[0].trim().toLowerCase();
      for (const [k, v] of Object.entries(COUNTRY_CODE_MAP)) {
        if (prefix.includes(k.toLowerCase()) && v) {
          return v;
        }
      }
    }

    const l = leagueName.toLowerCase();
    if (l.includes('english premier') || l.includes('epl') || l.includes('championship') || l.includes('league one') || l.includes('fa cup') || l.includes('carabao')) {
      return 'gb-eng';
    }
    if (l.includes('scottish') || l.includes('scotland')) {
      return 'gb-sct';
    }
    if (l.includes('la liga') || l.includes('laliga') || l.includes('copa del rey')) {
      return 'es';
    }
    if (l.includes('bundesliga') || l.includes('dfb')) {
      return 'de';
    }
    if (l.includes('serie a') || l.includes('serie b') || l.includes('coppa italia')) {
      return 'it';
    }
    if (l.includes('ligue 1') || l.includes('ligue 2')) {
      return 'fr';
    }
    if (l.includes('premiership') || l.includes('first division') || l.includes('mtn 8') || l.includes('nedbank')) {
      return 'za';
    }
  }

  return null;
}

interface CountryFlagCircleProps {
  country?: string;
  league?: string;
  fallbackEmoji?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES = {
  xs: 'w-4 h-4 text-[10px]',
  sm: 'w-5 h-5 text-xs',
  md: 'w-6 h-6 text-sm',
  lg: 'w-8 h-8 text-base',
};

export const CountryFlagCircle: React.FC<CountryFlagCircleProps> = ({
  country,
  league,
  fallbackEmoji = '⚽',
  size = 'sm',
  className = '',
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  const code = getCountryCode(country, league);
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.sm;

  // If we have a valid 2-letter or subdivision code and image hasn't errored
  const flagUrl = code && !imageFailed ? `https://flagcdn.com/w80/${code}.png` : null;

  return (
    <span
      className={`relative inline-flex items-center justify-center shrink-0 rounded-full overflow-hidden border border-slate-700/80 bg-slate-800 shadow-sm ${sizeClass} ${className}`}
      title={`${country || 'Country'} (${league || ''})`}
      role="img"
      aria-label={country || 'Country flag'}
    >
      {flagUrl ? (
        <img
          src={flagUrl}
          alt={country || 'flag'}
          className="w-full h-full object-cover rounded-full"
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="leading-none select-none flex items-center justify-center">
          {fallbackEmoji}
        </span>
      )}
    </span>
  );
};
