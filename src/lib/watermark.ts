import type { CSSProperties } from 'react';

export const WATERMARK_POSITIONS = ['top_left', 'top_right', 'center', 'bottom_left', 'bottom_right'] as const;
export type WatermarkPosition = (typeof WATERMARK_POSITIONS)[number];

export const WATERMARK_POSITION_LABELS: Record<WatermarkPosition, string> = {
  top_left: 'Top left',
  top_right: 'Top right',
  center: 'Center',
  bottom_left: 'Bottom left',
  bottom_right: 'Bottom right',
};

export const DEFAULT_WATERMARK_POSITION: WatermarkPosition = 'bottom_right';
export const DEFAULT_WATERMARK_OPACITY = 70;

/** Uploaded watermark file must be at most this many pixels wide and high. */
export const WATERMARK_MAX_UPLOAD_PX = 48;
/** Watermark is drawn as a square of `size` x `size` pixels of the actual image. */
export const WATERMARK_MIN_SIZE_PX = 16;
export const WATERMARK_MAX_SIZE_PX = 120;
export const DEFAULT_WATERMARK_SIZE = 48;
/** Edge margin as a percentage of the image width (same value is sent to the mobile app). */
export const WATERMARK_MARGIN_PERCENT = 3;
/** Image width assumed for the panel overlay until the real image width is known. */
const FALLBACK_IMAGE_WIDTH_PX = 1200;

export type EventWatermark = {
  url: string;
  position: WatermarkPosition;
  opacity: number;
  size: number;
  margin_percent: number;
};

export function toWatermarkPosition(value: string | null | undefined): WatermarkPosition {
  return (WATERMARK_POSITIONS as readonly string[]).includes(value ?? '')
    ? (value as WatermarkPosition)
    : DEFAULT_WATERMARK_POSITION;
}

export function clampWatermarkSize(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return DEFAULT_WATERMARK_SIZE;
  return Math.min(WATERMARK_MAX_SIZE_PX, Math.max(WATERMARK_MIN_SIZE_PX, Math.round(value)));
}

/** API/panel watermark object for an event, or null when no watermark image is set. */
export function buildEventWatermark(event: {
  watermark_url?: string | null;
  watermark_position?: string | null;
  watermark_opacity?: number | null;
  watermark_size?: number | null;
}): EventWatermark | null {
  const url = event.watermark_url?.trim();
  if (!url) return null;
  return {
    url,
    position: toWatermarkPosition(event.watermark_position),
    opacity: event.watermark_opacity ?? DEFAULT_WATERMARK_OPACITY,
    size: clampWatermarkSize(event.watermark_size),
    margin_percent: WATERMARK_MARGIN_PERCENT,
  };
}

/**
 * Absolute-position style for a watermark <img> inside a `position: relative` media box.
 * `imageWidth` is the natural width of the underlying image, so `size` maps to real image pixels.
 */
export function watermarkOverlayStyle(
  position: WatermarkPosition,
  opacity: number,
  size: number,
  imageWidth: number | null
): CSSProperties {
  const m = `${WATERMARK_MARGIN_PERCENT}%`;
  const widthPercent = Math.min(100, (clampWatermarkSize(size) / (imageWidth || FALLBACK_IMAGE_WIDTH_PX)) * 100);
  const style: CSSProperties = {
    position: 'absolute',
    width: `${widthPercent}%`,
    aspectRatio: '1 / 1',
    height: 'auto',
    objectFit: 'contain',
    opacity: Math.min(100, Math.max(0, opacity)) / 100,
    pointerEvents: 'none',
  };
  switch (position) {
    case 'top_left':
      return { ...style, top: m, left: m };
    case 'top_right':
      return { ...style, top: m, right: m };
    case 'center':
      return { ...style, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    case 'bottom_left':
      return { ...style, bottom: m, left: m };
    case 'bottom_right':
      return { ...style, bottom: m, right: m };
  }
}

/** Client-side check that an image file is at most `maxPx` x `maxPx`; returns an error message or null. */
export async function checkImageMaxDimensions(file: File, maxPx: number = WATERMARK_MAX_UPLOAD_PX): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('Could not read the image'));
      img.src = url;
    });
    if (width > maxPx || height > maxPx) {
      return `Watermark image must be at most ${maxPx}×${maxPx} px (this one is ${width}×${height} px).`;
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
