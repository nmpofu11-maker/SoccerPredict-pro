import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { isFavouriteTeam } from '../constants/favourites';
import { getTeamCrestUrl } from '../constants/teamCrests';

interface TeamBadgeProps {
  name: string;
  shortName: string;
  badgeColor?: string;
  badgeSecondary?: string;
  size?: 'sm' | 'md' | 'lg';
  showStar?: boolean;
}

export const TeamBadge: React.FC<TeamBadgeProps> = ({
  name,
  shortName,
  badgeColor = '#3b82f6',
  badgeSecondary,
  size = 'md',
  showStar = true,
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  const isFav = isFavouriteTeam(name);
  const crestUrl = getTeamCrestUrl(name);

  const containerSizeClasses = {
    sm: 'w-7 h-7',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  }[size];

  const imgSizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-7 h-7',
    lg: 'w-9 h-9',
  }[size];

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm font-bold',
    lg: 'text-base font-bold',
  }[size];

  // Derive nice initials (up to 3 chars)
  const initials = shortName || name.slice(0, 3).toUpperCase();

  return (
    <div
      className="relative inline-flex items-center justify-center flex-shrink-0"
      id={`team-badge-${shortName.toLowerCase()}`}
    >
      {/* Container with dynamic accent gradient and border */}
      <div
        className={`${containerSizeClasses} rounded-full flex items-center justify-center bg-slate-900 text-white tracking-wider shadow-inner ring-1 ring-white/20 transition-transform duration-200 hover:scale-105 select-none p-1 overflow-hidden`}
        style={{
          background: crestUrl && !imageFailed
            ? 'radial-gradient(circle, #1e293b 0%, #0f172a 100%)'
            : badgeSecondary
            ? `linear-gradient(135deg, ${badgeColor} 0%, ${badgeSecondary} 100%)`
            : `linear-gradient(135deg, ${badgeColor} 0%, #0f172a 100%)`,
          boxShadow: `0 0 12px ${badgeColor}33`,
        }}
        title={`${name} (${initials})`}
      >
        {crestUrl && !imageFailed ? (
          <img
            src={crestUrl}
            alt={name}
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            className={`${imgSizeClasses} object-contain filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]`}
            loading="lazy"
          />
        ) : (
          <span className={`${textSizeClasses} font-mono drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]`}>
            {initials}
          </span>
        )}
      </div>

      {/* Crisp Gold Star Badge directly adjacent/attached if team belongs to 80-favourite list */}
      {isFav && showStar && (
        <span
          className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 bg-amber-400 text-slate-950 rounded-full shadow-md ring-2 ring-slate-900 animate-pulse z-10"
          title="Priority 80 Favourite Team (Rule 8 Activated)"
        >
          <Star className="w-2.5 h-2.5 fill-slate-950 stroke-none" />
        </span>
      )}
    </div>
  );
};
