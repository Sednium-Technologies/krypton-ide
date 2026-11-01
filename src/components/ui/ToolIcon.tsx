import React, { useState } from 'react';
import { Bot, type LucideIcon } from 'lucide-react';

interface ToolIconProps {
  icon?: LucideIcon | string | React.ComponentType<any> | null;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function ToolIcon({ icon, size = 18, strokeWidth, className = '' }: ToolIconProps) {
  const [hasError, setHasError] = useState(false);

  if (!icon || hasError) {
    return <Bot size={size} strokeWidth={strokeWidth} className={className} />;
  }

  if (typeof icon === 'string') {
    return (
      <img
        src={icon}
        alt=""
        className={`object-contain rounded shrink-0 ${className}`}
        style={{ width: `${size}px`, height: `${size}px` }}
        onError={() => setHasError(true)}
      />
    );
  }

  const IconComponent = icon;
  return <IconComponent size={size} strokeWidth={strokeWidth} className={className} />;
}
