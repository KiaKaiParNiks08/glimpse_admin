import { NextResponse } from 'next/server';
import { DEFAULT_CHUNK_SIZE, MAX_CHUNK_SIZE } from '@/server/upload-sessions';

export async function GET() {
  return NextResponse.json({
    chunked: true,
    default_chunk_size: DEFAULT_CHUNK_SIZE,
    max_chunk_size: MAX_CHUNK_SIZE,
  });
}
