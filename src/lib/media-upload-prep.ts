'use client';

import { getMediaKind, resolveUploadMime, validateMediaFile } from '@/lib/upload-rules';

export type PreparedMediaCandidate = {
  file: File;
  kind: 'image' | 'video';
  mimeType: string;
  relativePath: string;
};

export type ExcludedFileItem = {
  name: string;
  reason: string;
};

/**
 * Extract valid image/video files from a FileList (handles both normal multi-file
 * selection and `<input webkitdirectory>` folder selection), completely flattening
 * nested folder paths and excluding unsupported / non-media files immediately.
 */
export function partitionMediaFiles(files: File[]): {
  accepted: PreparedMediaCandidate[];
  excluded: ExcludedFileItem[];
} {
  const accepted: PreparedMediaCandidate[] = [];
  const excluded: ExcludedFileItem[] = [];

  for (const file of files) {
    // Skip OS metadata files commonly inside folders (e.g. .DS_Store, Thumbs.db)
    const baseName = file.name.trim();
    if (!baseName || baseName.startsWith('._') || baseName === '.DS_Store' || baseName === 'Thumbs.db') {
      continue;
    }

    const mimeType = resolveUploadMime(file.type || '', baseName);
    const kind = getMediaKind(mimeType);
    if (kind !== 'image' && kind !== 'video') {
      excluded.push({
        name: baseName,
        reason: 'Unsupported file type (only images and videos allowed)',
      });
      continue;
    }

    const sizeErr = validateMediaFile({ type: mimeType, size: file.size }, kind);
    if (sizeErr) {
      excluded.push({ name: baseName, reason: sizeErr });
      continue;
    }

    const rel =
      typeof (file as File & { webkitRelativePath?: string }).webkitRelativePath === 'string' &&
      (file as File & { webkitRelativePath?: string }).webkitRelativePath!.trim()
        ? (file as File & { webkitRelativePath?: string }).webkitRelativePath!.trim()
        : baseName;

    accepted.push({
      file,
      kind,
      mimeType,
      relativePath: rel,
    });
  }

  return { accepted, excluded };
}

async function collectEntryFiles(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File | null>((resolve) => {
      fileEntry.file(
        (f) => resolve(f),
        () => resolve(null)
      );
    });
    if (file) out.push(file);
    return;
  }

  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const reader = dirEntry.createReader();
    // Chrome/Chromium readEntries returns at most 100 entries per call, so loop until empty.
    while (true) {
      const batch = await new Promise<FileSystemEntry[]>((resolve) => {
        reader.readEntries(
          (entries) => resolve(entries),
          () => resolve([])
        );
      });
      if (batch.length === 0) break;
      for (const child of batch) {
        await collectEntryFiles(child, out);
      }
    }
  }
}

/**
 * Recursively flatten files dropped from Finder / Windows Explorer (including nested folders)
 * so only leaf files are returned and directories are never displayed or queued.
 */
export async function extractFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const items = Array.from(dataTransfer.items ?? []);
  const entries = items
    .map((item) => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
    .filter((e): e is FileSystemEntry => e != null);

  if (entries.length > 0) {
    const out: File[] = [];
    for (const entry of entries) {
      await collectEntryFiles(entry, out);
    }
    return out;
  }

  return Array.from(dataTransfer.files ?? []);
}

async function canvasToJpegBlob(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  maxDim = 512
): Promise<Blob | null> {
  if (srcWidth <= 0 || srcHeight <= 0) return null;
  const scale = Math.min(1, maxDim / Math.max(srcWidth, srcHeight));
  const width = Math.max(1, Math.round(srcWidth * scale));
  const height = Math.max(1, Math.round(srcHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.72);
  });
}

async function sampleImageFrame(file: File): Promise<Blob[]> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const blob = await canvasToJpegBlob(bitmap, bitmap.width, bitmap.height);
        if (blob) return [blob];
      } finally {
        bitmap.close();
      }
    } catch {
      // Fallback to <img> element below
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      const timer = window.setTimeout(() => reject(new Error('Image preview timeout')), 5000);
      el.onload = () => {
        window.clearTimeout(timer);
        resolve(el);
      };
      el.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error('Image decode failed'));
      };
      el.src = url;
    });
    const blob = await canvasToJpegBlob(img, img.naturalWidth, img.naturalHeight);
    return blob ? [blob] : [];
  } catch {
    return [];
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function sampleVideoFramesAndDuration(file: File): Promise<{
  frames: Blob[];
  durationSec?: number;
}> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('Video metadata timeout')), 6000);
      video.onloadedmetadata = () => {
        window.clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error('Video cannot be decoded'));
      };
      video.src = url;
    });

    const rawDuration = video.duration;
    const durationSec = Number.isFinite(rawDuration) && rawDuration > 0 ? Math.round(rawDuration) : undefined;
    const sampleFractions = rawDuration > 1 ? [0.1, 0.35, 0.65, 0.9] : [0];
    const frames: Blob[] = [];

    for (const frac of sampleFractions) {
      const targetTime = Math.max(0, Math.min((rawDuration || 0) - 0.1, (rawDuration || 0) * frac));
      const seekOk = await new Promise<boolean>((resolve) => {
        const timer = window.setTimeout(() => resolve(false), 3500);
        const onSeeked = () => {
          window.clearTimeout(timer);
          video.removeEventListener('seeked', onSeeked);
          resolve(true);
        };
        video.addEventListener('seeked', onSeeked);
        try {
          video.currentTime = targetTime;
        } catch {
          window.clearTimeout(timer);
          video.removeEventListener('seeked', onSeeked);
          resolve(false);
        }
      });
      if (!seekOk) continue;
      const blob = await canvasToJpegBlob(video, video.videoWidth, video.videoHeight);
      if (blob) frames.push(blob);
    }

    return { frames, durationSec };
  } catch {
    return { frames: [], durationSec: undefined };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

/**
 * Sample compact JPEG frames (for 18+ moderation) and measure video duration on the client
 * without stalling the UI thread.
 */
export async function inspectMediaForModerationAndMeta(
  file: File,
  kind: 'image' | 'video'
): Promise<{ frames: Blob[]; durationSec?: number }> {
  if (kind === 'image') {
    const frames = await sampleImageFrame(file);
    return { frames };
  }
  return sampleVideoFramesAndDuration(file);
}
