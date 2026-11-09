import React, { useState } from 'react';

export interface OortyLiteIconProps {
  size?: number;
  className?: string;
  useImage?: boolean;
}

export function OortyLiteIcon({ size = 16, className = 'text-[#f3f0e7]', useImage = true }: OortyLiteIconProps) {
  const [imgError, setImgError] = useState(false);

  if (useImage && !imgError) {
    return (
      <img
        src="/oorty_icon.png"
        alt="Oorty Lite"
        width={size}
        height={size}
        onError={() => setImgError(true)}
        className={`inline-block object-contain rounded-sm select-none ${className}`}
        style={{ width: size, height: size, minWidth: size, minHeight: size }}
      />
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-label="Oorty Lite"
    >
      {/* Oorty Lite Distilled Neural Core */}
      <rect x="3" y="10" width="18" height="11" rx="3.5" />
      <circle cx="8.5" cy="15.5" r="1.5" fill="currentColor" />
      <circle cx="15.5" cy="15.5" r="1.5" fill="currentColor" />
      <path d="M12 2v4" />
      <path d="M7 6h10" />
      <path d="M12 10V6" />
      <circle cx="12" cy="2" r="1.5" fill="currentColor" />
    </svg>
  );
}

// Backwards compatibility alias
export default OortyLiteIcon;
