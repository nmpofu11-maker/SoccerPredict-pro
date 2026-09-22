import React, { useState } from 'react';

// ISO 3166-1 alpha-2 mapping for countries/regions
const COUNTRY_CODE_MAP: Record<string, string> = {
  'South Africa': 'za',
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
  'Saudi Arabia': 'sa',
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
  'China': 'cn',
  'Australia': 'au',
  'South Korea': 'kr',
  'Croatia': 'hr',
  'Ireland': 'ie',
  'Romania': 'ro',
  'Latvia': 'lv',
  'Malaysia': 'my',
  'Europe': 'eu',
  // Continental or Global
  'Africa': '',
  'South America': '',
  'Global': '',
};

export function getCountryCode(countryName?: string, leagueName?: string): string | null {
  if (leagueName) {
    const l = leagueName.toLowerCase();
    if (l.includes('premier league') || l.includes('championship') || l.includes('league one') || l.includes('fa cup') || l.includes('carabao')) {
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

  if (!countryName) return null;
  const direct = COUNTRY_CODE_MAP[countryName];
  if (direct) return direct;

  const lower = countryName.toLowerCase().trim();
  for (const [k, v] of Object.entries(COUNTRY_CODE_MAP)) {
    if (k.toLowerCase() === lower && v) {
      return v;
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
