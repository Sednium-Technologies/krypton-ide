import React, { useState, useEffect, useMemo } from 'react';
import { useExtensionsStore } from '../../store/useExtensionsStore';
import { useIdeStore } from '../../store/useIdeStore';
import { resolveFileIconSvg, resolveFolderIconSvg } from '../../lib/dynamicIconEngine';

export interface LanguageIconProps {
  fileName: string;
  className?: string;
  size?: number;
}

export function LanguageIcon({ fileName, className = '', size = 16 }: LanguageIconProps) {
  const activeIconTheme = useExtensionsStore((state) => state.activeIconTheme);
  const activeThemeExtension = useExtensionsStore((state) => state.activeThemeExtension);
  const theme = useIdeStore((state) => state.theme);
  const isLight = theme === 'light';
  const [, setVersion] = useState(0);

  // Re-render dynamically whenever the user changes or installs an icon theme
  useEffect(() => {
    const handleUpdate = () => {
      setVersion((v) => v + 1);
    };
    window.addEventListener('krypton:icon-theme-updated', handleUpdate);
    return () => window.removeEventListener('krypton:icon-theme-updated', handleUpdate);
  }, []);

  const themeId = activeIconTheme || activeThemeExtension;
  const svgHtml = useMemo(() => {
    return resolveFileIconSvg(fileName, themeId, isLight);
  }, [fileName, themeId, isLight]);

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 select-none [&>svg]:w-full [&>svg]:h-full [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:block ${className}`}
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
      dangerouslySetInnerHTML={{ __html: svgHtml }}
    />
  );
}

export interface FolderIconProps {
  folderName: string;
  isOpen?: boolean;
  className?: string;
  size?: number;
}

export function FolderIcon({ folderName, isOpen = false, className = '', size = 16 }: FolderIconProps) {
  const activeIconTheme = useExtensionsStore((state) => state.activeIconTheme);
  const activeThemeExtension = useExtensionsStore((state) => state.activeThemeExtension);
  const theme = useIdeStore((state) => state.theme);
  const isLight = theme === 'light';
  const [, setVersion] = useState(0);

  // Re-render dynamically whenever the user changes or installs an icon theme
  useEffect(() => {
    const handleUpdate = () => {
      setVersion((v) => v + 1);
    };
    window.addEventListener('krypton:icon-theme-updated', handleUpdate);
    return () => window.removeEventListener('krypton:icon-theme-updated', handleUpdate);
  }, []);

  const themeId = activeIconTheme || activeThemeExtension;
  const svgHtml = useMemo(() => {
    return resolveFolderIconSvg(folderName, isOpen, themeId, isLight);
  }, [folderName, isOpen, themeId, isLight]);

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 select-none [&>svg]:w-full [&>svg]:h-full [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:block ${className}`}
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
      dangerouslySetInnerHTML={{ __html: svgHtml }}
    />
  );
}
