import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
}

/**
 * HeirFlow minimalist architectural crest logo:
 * An interlocking vault frame forming an understated "H" monogram.
 */
const Logo: React.FC<LogoProps> = ({ size = 'md', showWordmark = true }) => {
  const dims = size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-10 h-10' : 'w-8 h-8';
  const textSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-xl' : 'text-lg';

  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      <div className={`${dims} rounded-lg bg-zinc-900 border border-zinc-700/80 flex items-center justify-center shrink-0`}>
        <svg viewBox="0 0 32 32" fill="none" className="w-4/5 h-4/5" aria-hidden="true">
          <rect x="4" y="4" width="24" height="24" rx="5" stroke="#52525B" strokeWidth="1.4" />
          <path d="M10.5 9.5V22.5" stroke="#FAFAFA" strokeWidth="2" strokeLinecap="round" />
          <path d="M21.5 9.5V22.5" stroke="#FAFAFA" strokeWidth="2" strokeLinecap="round" />
          <path d="M10.5 16H21.5" stroke="#D4AF37" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="16" cy="16" r="1.6" fill="#FAFAFA" />
        </svg>
      </div>
      {showWordmark && (
        <span className={`${textSize} font-semibold tracking-tight text-zinc-100`}>
          HeirFlow
        </span>
      )}
    </div>
  );
};

export default Logo;
