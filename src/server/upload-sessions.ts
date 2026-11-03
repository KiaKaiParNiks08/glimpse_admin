import { randomUUID } from 'crypto';
import prisma from '@/server/prisma';
import { isS3Configured } from '@/lib/upload';
import { deleteObjectByKey, getObjectBuffer, putObjectFromBuffer } from '@/lib/s3-presign';

export const DEFAULT_CHUNK_SIZE = 2 * 1024 * 1024; // 2 MiB
export const MAX_CHUNK_SIZE = 8 * 1024 * 1024; // 8 MiB

let schemaEnsured = false;

export async function ensureUploadSessionsSchema(): Promise<void> {
  if (schemaEnsured) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS upload_sessions (
        id TEXT PRIMARY KEY,
        user_id UUID NOT NULL,
        event_id UUID NOT NULL,
        filename TEXT NOT NULL,
        file_size BIGINT NOT NULL,
        content_type TEXT NOT NULL,
        purpose TEXT NOT NULL,
        meta JSONB,
        chunk_size INTEGER NOT NULL DEFAULT 2097152,
        total_chunks INTEGER NOT NULL,
        received_bytes BIGINT NOT NULL DEFAULT 0,
        next_chunk_index INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        final_media_url TEXT,
        final_storage_key TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_upload_sessions_user_event ON upload_sessions(user_id, event_id);

      CREATE TABLE IF NOT EXISTS upload_session_chunks (
        upload_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        byte_length INTEGER NOT NULL,
        storage_key TEXT,
        chunk_data BYTEA,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (upload_id, chunk_index)
      );
    `);
    schemaEnsured = true;
  } catch (error) {
    console.error('[upload-sessions] ensureUploadSessionsSchema warning:', error);
    schemaEnsured = true;
  }
}

export interface UploadSessionRow {
  id: string;
  user_id: string;
  event_id: string;
  filename: string;
  file_size: string | number;
  content_type: string;
  purpose: string;
  meta: unknown;
  chunk_size: number;
  total_chunks: number;
  received_bytes: string | number;
  next_chunk_index: number;
  status: string;
  final_media_url: string | null;
  final_storage_key: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUploadSessionInput {
  userId: string;
  eventId: string;
  filename: string;
  fileSizeBytes: number;
  contentType: string;
  purpose: string;
  meta?: unknown;
}

export async function createUploadSession(input: CreateUploadSessionInput): Promise<{
  upload_id: string;
  chunk_size: number;
  total_chunks: number;
  next_chunk_index: number;
}> {
  await ensureUploadSessionsSchema();

  const uploadId = `up_${randomUUID().replace(/-/g, '')}`;
  const chunkSize = DEFAULT_CHUNK_SIZE;
  const totalChunks = Math.max(1, Math.ceil(input.fileSizeBytes / chunkSize));

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO upload_sessions (
      id, user_id, event_id, filename, file_size, content_type,
      purpose, meta, chunk_size, total_chunks, received_bytes, next_chunk_index, status
    ) VALUES (
      $1, $2::uuid, $3::uuid, $4, $5, $6,
      $7, $8::jsonb, $9, $10, 0, 0, 'pending'
    )
  `,
    uploadId,
    input.userId,
    input.eventId,
    input.filename,
    input.fileSizeBytes,
    input.contentType,
    input.purpose,
    JSON.stringify(input.meta ?? {}),
    chunkSize,
    totalChunks
  );

  return {
    upload_id: uploadId,
    chunk_size: chunkSize,
    total_chunks: totalChunks,
    next_chunk_index: 0,
  };
}

export async function getUploadSession(uploadId: string): Promise<UploadSessionRow | null> {
  await ensureUploadSessionsSchema();
  const rows = await prisma.$queryRawUnsafe<UploadSessionRow[]>(
    `SELECT * FROM upload_sessions WHERE id = $1 LIMIT 1`,
    uploadId
  );
  return rows[0] || null;
}

export async function saveUploadChunk(input: {
  uploadId: string;
  chunkIndex: number;
  bytes: Buffer;
}): Promise<{ received_bytes: number; next_chunk_index: number }> {
  await ensureUploadSessionsSchema();

  const session = await getUploadSession(input.uploadId);
  if (!session) {
    throw new Error('UPLOAD_SESSION_NOT_FOUND');
  }

  let storageKey: string | null = null;
  let chunkData: Buffer | null = null;

  if (isS3Configured()) {
    storageKey = `temp_uploads/${input.uploadId}/chunk_${input.chunkIndex}`;
    await putObjectFromBuffer(storageKey, input.bytes, 'application/octet-stream');
  } else {
    chunkData = input.bytes;
  }

  // Idempotently store chunk record
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO upload_session_chunks (upload_id, chunk_index, byte_length, storage_key, chunk_data, created_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (upload_id, chunk_index)
    DO UPDATE SET
      byte_length = EXCLUDED.byte_length,
      storage_key = EXCLUDED.storage_key,
      chunk_data = EXCLUDED.chunk_data,
      created_at = NOW()
  `,
    input.uploadId,
    input.chunkIndex,
    input.bytes.length,
    storageKey,
    chunkData
  );

  // Calculate contiguous next_chunk_index & total received_bytes
  const chunks = await prisma.$queryRawUnsafe<{ chunk_index: number; byte_length: number }[]>(
    `SELECT chunk_index, byte_length FROM upload_session_chunks WHERE upload_id = $1 ORDER BY chunk_index ASC`,
    input.uploadId
  );

  const receivedSet = new Set(chunks.map((c) => c.chunk_index));
  let nextChunkIndex = 0;
  while (receivedSet.has(nextChunkIndex)) {
    nextChunkIndex++;
  }

  const totalReceivedBytes = chunks.reduce((acc, c) => acc + Number(c.byte_length), 0);

  await prisma.$executeRawUnsafe(
    `UPDATE upload_sessions SET received_bytes = $1, next_chunk_index = $2, updated_at = NOW() WHERE id = $3`,
    totalReceivedBytes,
    nextChunkIndex,
    input.uploadId
  );

  return {
    received_bytes: totalReceivedBytes,
    next_chunk_index: nextChunkIndex,
  };
}

export async function assembleUploadSession(uploadId: string): Promise<{
  session: UploadSessionRow;
  buffer: Buffer;
}> {
  await ensureUploadSessionsSchema();

  const session = await getUploadSession(uploadId);
  if (!session) {
    throw new Error('UPLOAD_SESSION_NOT_FOUND');
  }

  const chunks = await prisma.$queryRawUnsafe<
    { chunk_index: number; byte_length: number; storage_key: string | null; chunk_data: Buffer | null }[]
  >(
    `SELECT chunk_index, byte_length, storage_key, chunk_data FROM upload_session_chunks WHERE upload_id = $1 ORDER BY chunk_index ASC`,
    uploadId
  );

  const totalExpected = session.total_chunks;
  if (chunks.length < totalExpected) {
    throw new Error(`INCOMPLETE_CHUNKS: received ${chunks.length} of ${totalExpected}`);
  }

  // Ensure each sequential chunk index 0..totalExpected-1 is present
  const chunkMap = new Map(chunks.map((c) => [c.chunk_index, c]));
  const buffers: Buffer[] = [];

  for (let i = 0; i < totalExpected; i++) {
    const chunk = chunkMap.get(i);
    if (!chunk) {
      throw new Error(`MISSING_CHUNK: chunk ${i} is missing`);
    }

    if (chunk.storage_key) {
      const obj = await getObjectBuffer(chunk.storage_key);
      if (!obj) {
        throw new Error(`CHUNK_STORAGE_ERROR: unable to fetch ${chunk.storage_key}`);
      }
      buffers.push(obj.buffer);
    } else if (chunk.chunk_data) {
      buffers.push(chunk.chunk_data);
    } else {
      throw new Error(`CHUNK_CORRUPT: chunk ${i} has neither storage_key nor chunk_data`);
    }
  }

  const assembled = Buffer.concat(buffers);
  if (assembled.length !== Number(session.file_size)) {
    throw new Error(`SIZE_MISMATCH: expected ${session.file_size} bytes but assembled ${assembled.length} bytes`);
  }

  return {
    session,
    buffer: assembled,
  };
}

export async function cleanupUploadSession(
  uploadId: string,
  finalInfo?: { url: string; key: string }
): Promise<void> {
  try {
    const chunks = await prisma.$queryRawUnsafe<{ storage_key: string | null }[]>(
      `SELECT storage_key FROM upload_session_chunks WHERE upload_id = $1`,
      uploadId
    );

    for (const c of chunks) {
      if (c.storage_key) {
        await deleteObjectByKey(c.storage_key).catch(() => null);
      }
    }

    await prisma.$executeRawUnsafe(`DELETE FROM upload_session_chunks WHERE upload_id = $1`, uploadId);

    if (finalInfo) {
      await prisma.$executeRawUnsafe(
        `UPDATE upload_sessions SET status = 'completed', final_media_url = $1, final_storage_key = $2, updated_at = NOW() WHERE id = $3`,
        finalInfo.url,
        finalInfo.key,
        uploadId
      );
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE upload_sessions SET status = 'completed', updated_at = NOW() WHERE id = $1`,
        uploadId
      );
    }
  } catch (error) {
    console.warn('[upload-sessions] cleanupUploadSession warning:', error);
  }
}
