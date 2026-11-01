import { useEffect, useRef } from 'react';

interface UsePinchZoomOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  fontSize: number;
  onFontSizeChange: (newSize: number) => void;
  minFontSize?: number;
  maxFontSize?: number;
}

export function usePinchZoom({
  containerRef,
  fontSize,
  onFontSizeChange,
  minFontSize = 8,
  maxFontSize = 36,
}: UsePinchZoomOptions) {
  const initialPinchDistRef = useRef<number | null>(null);
  const initialFontSizeRef = useRef<number>(fontSize);
  const currentFontSizeRef = useRef<number>(fontSize);

  useEffect(() => {
    currentFontSizeRef.current = fontSize;
  }, [fontSize]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const getDistance = (touches: TouchList) => {
      if (touches.length < 2) return 0;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        initialPinchDistRef.current = getDistance(e.touches);
        initialFontSizeRef.current = currentFontSizeRef.current;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialPinchDistRef.current && initialPinchDistRef.current > 0) {
        const currentDist = getDistance(e.touches);
        const scale = currentDist / initialPinchDistRef.current;
        let newSize = Math.round(initialFontSizeRef.current * scale);
        newSize = Math.max(minFontSize, Math.min(maxFontSize, newSize));

        if (newSize !== currentFontSizeRef.current) {
          currentFontSizeRef.current = newSize;
          onFontSizeChange(newSize);
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        initialPinchDistRef.current = null;
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [containerRef, onFontSizeChange, minFontSize, maxFontSize]);
}
