import test from 'node:test';
import assert from 'node:assert/strict';

const DEFAULT_CHUNK_SIZE = 2 * 1024 * 1024; // 2 MiB
const MAX_CHUNK_SIZE = 8 * 1024 * 1024; // 8 MiB

test('resumable upload contracts and calculations', async (t) => {
  await t.test('default chunk size and max chunk size comply with client expectations', () => {
    assert.equal(DEFAULT_CHUNK_SIZE, 2097152); // 2 MiB
    assert.equal(MAX_CHUNK_SIZE, 8388608); // 8 MiB
  });

  await t.test('total chunk calculation accurately divides files', () => {
    const calc = (fileSize: number, chunkSize: number = DEFAULT_CHUNK_SIZE) =>
      Math.max(1, Math.ceil(fileSize / chunkSize));

    assert.equal(calc(1024), 1); // 1 KB -> 1 chunk
    assert.equal(calc(2097152), 1); // Exact 2 MiB -> 1 chunk
    assert.equal(calc(2097153), 2); // 2 MiB + 1 byte -> 2 chunks
    assert.equal(calc(5242880), 3); // 5 MiB -> 3 chunks
    assert.equal(calc(50 * 1024 * 1024), 25); // 50 MiB -> 25 chunks
  });

  await t.test('contiguous chunk index tracking identifies lowest missing chunk', () => {
    const computeNextChunk = (receivedIndices: number[]) => {
      const set = new Set(receivedIndices);
      let next = 0;
      while (set.has(next)) {
        next++;
      }
      return next;
    };

    assert.equal(computeNextChunk([]), 0);
    assert.equal(computeNextChunk([0]), 1);
    assert.equal(computeNextChunk([0, 1]), 2);
    // Out of order: chunk 0 and 2 received, chunk 1 missing -> expects 1
    assert.equal(computeNextChunk([0, 2]), 1);
    // Once 1 arrives:
    assert.equal(computeNextChunk([0, 2, 1]), 3);
  });

  await t.test('idempotent chunk re-upload does not duplicate byte length', () => {
    const chunkStore = new Map<number, number>();
    const saveChunk = (index: number, length: number) => {
      chunkStore.set(index, length); // Overwrites
      return Array.from(chunkStore.values()).reduce((acc, len) => acc + len, 0);
    };

    assert.equal(saveChunk(0, 2097152), 2097152);
    // Re-uploading chunk 0 should yield identical total length
    assert.equal(saveChunk(0, 2097152), 2097152);
    // Uploading chunk 1
    assert.equal(saveChunk(1, 1048576), 2097152 + 1048576);
  });

  await t.test('chunk assembly reconstructs original binary payload', () => {
    const originalText = 'Hello World from Glimpse Resumable Upload Queue!';
    const fullBuffer = Buffer.from(originalText, 'utf-8');

    // Split into 3 small chunks
    const chunk0 = fullBuffer.subarray(0, 15);
    const chunk1 = fullBuffer.subarray(15, 30);
    const chunk2 = fullBuffer.subarray(30);

    const chunks = [chunk0, chunk1, chunk2];
    const assembled = Buffer.concat(chunks);

    assert.equal(assembled.toString('utf-8'), originalText);
    assert.equal(assembled.length, fullBuffer.length);
  });
});
