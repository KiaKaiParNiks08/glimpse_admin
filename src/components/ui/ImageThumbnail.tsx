'use client';

import React, { useState, useEffect } from 'react';
import { resolveMediaUrl } from '@/lib/media-url';
import styles from './ImageThumbnail.module.scss';

interface ImageThumbnailProps {
  src?: string | null;
  alt: string;
  size?: number;
  width?: number;
  height?: number;
  icon?: React.ReactNode;
  className?: string;
  borderRadius?: number | string;
}

export function ImageThumbnail({
  src,
  alt,
  size = 48,
  width,
  height,
  icon,
  className,
  borderRadius = 8,
}: ImageThumbnailProps) {
  const [hasError, setHasError] = useState(false);
  const resolved = resolveMediaUrl(src);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  const w = width ?? size;
  const h = height ?? size;

  return (
    <div
      className={`${styles.container} ${className || ''}`}
      style={{
        width: `${w}px`,
        height: `${h}px`,
        minWidth: `${w}px`,
        borderRadius: typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius,
      }}
    >
      {resolved && !hasError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolved}
          alt={alt}
          className={styles.img}
          onError={() => setHasError(true)}
          loading="lazy"
        />
      ) : (
        <div className={styles.fallback} aria-hidden="true">
          {icon ?? null}
        </div>
      )}
    </div>
  );
}
