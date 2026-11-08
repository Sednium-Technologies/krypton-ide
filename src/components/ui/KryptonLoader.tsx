import React from 'react';
import { useIdeStore } from '../../store/useIdeStore';

interface KryptonLoaderProps {
  text?: string;
  size?: 'sm' | 'md' | 'lg';
  isLight?: boolean;
}

export function KryptonLoader({ text, size = 'md', isLight: propIsLight }: KryptonLoaderProps) {
  const currentTheme = useIdeStore((s) => s.theme);
  const isLight = propIsLight !== undefined 
    ? propIsLight 
    : (currentTheme === 'light' || (typeof document !== 'undefined' && document.documentElement.classList.contains('light')));

  const scaleClass = size === 'sm' ? 'scale-50' : size === 'lg' ? 'scale-110' : 'scale-75';

  const spokeBg = isLight ? 'rgba(42, 37, 41, 0.08)' : 'rgba(243, 240, 231, 0.07)';
  const spokeBorder = isLight ? 'rgba(42, 37, 41, 0.14)' : 'rgba(243, 240, 231, 0.1)';
  const ballBg = isLight ? '#2a2529' : '#f3f0e7';
  const ballShadow = isLight
    ? '0 0 10px rgba(42, 37, 41, 0.45), 0 0 20px rgba(42, 37, 41, 0.2), inset 0 -3px 4px rgba(255, 255, 255, 0.4)'
    : '0 0 10px rgba(243, 240, 231, 0.8), 0 0 20px rgba(243, 240, 231, 0.4), inset 0 -3px 4px rgba(0, 0, 0, 0.3)';

  return (
    <div className="flex flex-col items-center justify-center p-4 select-none">
      <style>{`
        .krypton-loader-main {
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
        }

        .krypton-loaders,
        .krypton-loadersB {
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }

        .krypton-spoke {
          position: absolute;
          width: 1.15em;
          height: 13em;
          border-radius: 50px;
          background: ${spokeBg};
          border: 1px solid ${spokeBorder};
        }

        .krypton-spoke-track {
          position: absolute;
          width: 1.15em;
          height: 13em;
          border-radius: 50px;
          background: transparent;
        }

        .krypton-ball {
          width: 1.15em;
          height: 1.15em;
          border-radius: 50%;
          background-color: ${ballBg};
          box-shadow: ${ballShadow};
          animation: kryptonMoveBall 3.2s ease-in-out infinite;
        }

        @keyframes kryptonMoveBall {
          0% {
            transform: translateY(0em);
          }
          50% {
            transform: translateY(11.85em);
          }
          100% {
            transform: translateY(0em);
          }
        }
      `}</style>
      
      <div className={`krypton-loader-main ${scaleClass}`}>
        <div className="relative w-[13em] h-[13em] flex items-center justify-center">
          {/* Spoke tracks */}
          <div className="krypton-loaders">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={`spoke-${i}`}
                className="krypton-spoke"
                style={{ transform: `rotate(${i * 20}deg)` }}
              />
            ))}
          </div>

          {/* Animated balls */}
          <div className="krypton-loadersB">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={`ball-track-${i}`}
                className="krypton-spoke-track"
                style={{ transform: `rotate(${i * 20}deg)` }}
              >
                <div
                  className="krypton-ball"
                  style={{ animationDelay: `${i * 0.18}s` }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {text && (
        <span className={`mt-6 text-xs font-bold uppercase tracking-widest animate-pulse ${
          isLight ? 'text-[#2a2529]/90' : 'text-[#f3f0e7]/80'
        }`}>
          {text}
        </span>
      )}
    </div>
  );
}
