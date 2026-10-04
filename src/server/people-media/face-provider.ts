import { createHash } from 'crypto';
import { z } from 'zod';
import { FACE_EMBEDDING_DIM, faceProviderKind } from './config';
import type { DetectedFace, FaceProvider } from './types';

const boxSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite(),
  height: z.number().finite(),
});

const httpFaceSchema = z.object({
  confidence: z.number().finite(),
  box: boxSchema,
  embedding: z.array(z.number().finite()).length(FACE_EMBEDDING_DIM),
});

const httpResponseSchema = z.object({
  faces: z.array(httpFaceSchema).max(50),
});

function l2Normalize(values: number[]): number[] {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!norm) return values.map(() => 0);
  return values.map((value) => value / norm);
}

/**
 * Deterministic embedding so the pipeline can run without a GPU.
 * The same file always maps to the same vector. Different photos of the same person do not match.
 * Set FACE_PROVIDER=http for real detection.
 */
function embeddingFromBytes(bytes: Buffer): number[] {
  const out = new Array<number>(FACE_EMBEDDING_DIM).fill(0);
  let block = createHash('sha256').update(bytes).digest();
  for (let round = 0; round < FACE_EMBEDDING_DIM / 32; round += 1) {
    block = createHash('sha256').update(block).update(bytes.subarray(0, Math.min(bytes.length, 8192))).digest();
    for (let i = 0; i < 32; i += 1) {
      out[round * 32 + i] = block[i] / 127.5 - 1;
    }
  }
  return l2Normalize(out);
}

const localProvider: FaceProvider = {
  name: 'local',
  async detectFaces({ bytes, contentType, mediaType }) {
    if (mediaType !== 'image' || !contentType.startsWith('image/') || bytes.length === 0) {
      return [];
    }
    return [
      {
        confidence: 1,
        box: { x: 0, y: 0, width: 1, height: 1 },
        embedding: embeddingFromBytes(bytes),
      },
    ];
  },
};

function httpProvider(): FaceProvider {
  return {
    name: 'http',
    async detectFaces({ bytes, contentType, mediaType }) {
      const url = process.env.FACE_SERVICE_URL?.trim();
      if (!url) throw new Error('FACE_SERVICE_URL is required when FACE_PROVIDER=http');
      const timeoutMs = Number(process.env.FACE_SERVICE_TIMEOUT_MS ?? '20000');
      const headers: Record<string, string> = {
        'content-type': contentType || 'application/octet-stream',
        'x-media-type': mediaType,
      };
      const token = process.env.FACE_SERVICE_TOKEN?.trim();
      if (token) headers.authorization = `Bearer ${token}`;
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: new Uint8Array(bytes),
        signal: AbortSignal.timeout(Number.isFinite(timeoutMs) ? timeoutMs : 20000),
      });
      if (!response.ok) {
        throw new Error(`Face service returned ${response.status}`);
      }
      const parsed = httpResponseSchema.parse(await response.json());
      return parsed.faces.map(
        (face): DetectedFace => ({
          confidence: face.confidence,
          box: face.box,
          embedding: face.embedding,
        })
      );
    },
  };
}

export function getFaceProvider(): FaceProvider {
  return faceProviderKind() === 'http' ? httpProvider() : localProvider;
}
