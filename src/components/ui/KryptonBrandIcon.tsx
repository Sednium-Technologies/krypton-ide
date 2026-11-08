import React, { useState } from 'react';

interface KryptonBrandIconProps {
  size?: number;
  className?: string;
  isLight?: boolean;
}

export function KryptonBrandIcon({ size = 28, className = '', isLight = false }: KryptonBrandIconProps) {
  const [imgError, setImgError] = useState(false);

  if (!imgError) {
    return (
      <img
        src="/icon.png"
        alt="Kryptonide"
        width={size}
        height={size}
        className={`object-contain rounded-xl select-none ${className}`}
        onError={() => setImgError(true)}
      />
    );
  }

  const primaryStroke = isLight ? '#2a2529' : '#f3f0e7';
  const accentFill = '#7c9b79';
  const glowFill = isLight ? 'rgba(42, 37, 41, 0.08)' : 'rgba(243, 240, 231, 0.12)';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Kryptonide Brand Logo"
    >
      <defs>
        <linearGradient id="kryptonBrandGrad" x1="10" y1="10" x2="90" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7c9b79" />
          <stop offset="50%" stopColor="#88c0d0" />
          <stop offset="100%" stopColor={primaryStroke} />
        </linearGradient>
        <radialGradient id="kryptonCoreGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={accentFill} stopOpacity="0.8" />
          <stop offset="100%" stopColor={accentFill} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Hexagonal Orbital Shield Frame */}
      <polygon
        points="50,6 88,28 88,72 50,94 12,72 12,28"
        stroke={primaryStroke}
        strokeWidth="3.5"
        strokeLinejoin="round"
        fill={glowFill}
      />

      {/* Inner Dynamic K-Geometry Geometry */}
      <path
        d="M34 26 V74 M34 50 L64 26 M44 42 L66 74"
        stroke="url(#kryptonBrandGrad)"
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Central Core Reactor Dot */}
      <circle cx="50" cy="50" r="16" fill="url(#kryptonCoreGlow)" />
      <circle cx="34" cy="50" r="3" fill={accentFill} />
      <circle cx="64" cy="26" r="2.5" fill="#88c0d0" />
      <circle cx="66" cy="74" r="2.5" fill={primaryStroke} />
    </svg>
  );
}
