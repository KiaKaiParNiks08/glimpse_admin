'use client';

import { useEffect, useRef, useState } from 'react';
import { watermarkOverlayStyle, type WatermarkPosition } from '@/lib/watermark';

type WatermarkOverlayProps = {
  url: string | null | undefined;
  position: WatermarkPosition;
  opacity: number;
  /** Side of the square in actual image pixels */
  size: number;
};

/**
 * Watermark image drawn over media; the parent must be `position: relative` and contain the media <img>.
 * The width is scaled from the media image's natural width so `size` matches real image pixels.
 */
export function WatermarkOverlay({ url, position, opacity, size }: WatermarkOverlayProps) {
  const ref = useRef<HTMLImageElement>(null);
  const [imageWidth, setImageWidth] = useState<number | null>(null);

  useEffect(() => {
    const base = ref.current?.parentElement?.querySelector<HTMLImageElement>('img:not([data-watermark])');
    if (!base) return;
    const update = () => {
      if (base.naturalWidth) setImageWidth(base.naturalWidth);
    };
    update();
    base.addEventListener('load', update);
    return () => base.removeEventListener('load', update);
  }, [url]);

  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- dynamic uploaded content
    <img
      ref={ref}
      src={url}
      alt=""
      aria-hidden="true"
      data-watermark=""
      style={watermarkOverlayStyle(position, opacity, size, imageWidth)}
    />
  );
}
