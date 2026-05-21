import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const PACKED_WEBP_CHUNK_TYPE = "TDEN";
const PACKED_WEBP_VERSION = 1;
const PACKED_WEBP_IV_LENGTH = 16;
const PACKED_WEBP_TAG_LENGTH = 32;
const PACKED_WEBP_HEADER_LENGTH = 1 + PACKED_WEBP_IV_LENGTH + 4;
const RIFF_HEADER_LENGTH = 12;

export function mulberry32(seed: number): () => number {
  return function next() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function cyrb128(input: string): number {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;

  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ code, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ code, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ code, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ code, 2716044179);
  }

  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);

  return (h1 ^ h2 ^ h3 ^ h4) >>> 0;
}

export function xorNoiseRgba(input: Uint8Array, key: string): Buffer {
  const output = Buffer.from(input);
  const rand = mulberry32(cyrb128(key));

  for (let index = 0; index < output.length; index += 4) {
    output[index] ^= Math.floor(rand() * 256);
    output[index + 1] ^= Math.floor(rand() * 256);
    output[index + 2] ^= Math.floor(rand() * 256);
  }

  return output;
}

export function createPackedCarrierRgb(width: number, height: number, key: string): Buffer {
  const output = Buffer.alloc(width * height * 3);
  const tileSize = 16;
  const rand = mulberry32(cyrb128(`packed-carrier:${key}:${width}x${height}`));
  const tile = Buffer.alloc(tileSize * tileSize * 3);

  for (let index = 0; index < tile.length; index += 1) {
    tile[index] = Math.floor(rand() * 256);
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 3;
      const source = ((y % tileSize) * tileSize + (x % tileSize)) * 3;
      output[destination] = tile[source];
      output[destination + 1] = tile[source + 1];
      output[destination + 2] = tile[source + 2];
    }
  }

  return output;
}

export function encryptPackedWebpPayload(innerWebp: Uint8Array, key: string): Buffer {
  const iv = randomBytes(PACKED_WEBP_IV_LENGTH);
  const cipher = createCipheriv("aes-256-ctr", derivePackedKey("enc", key), iv);
  const ciphertext = Buffer.concat([cipher.update(innerWebp), cipher.final()]);
  const header = Buffer.alloc(PACKED_WEBP_HEADER_LENGTH);

  header[0] = PACKED_WEBP_VERSION;
  iv.copy(header, 1);
  header.writeUInt32BE(ciphertext.length, 1 + PACKED_WEBP_IV_LENGTH);

  const tag = createPackedTag(key, header, ciphertext);
  return Buffer.concat([header, tag, ciphertext]);
}

export function decryptPackedWebpPayload(payload: Uint8Array, key: string): Buffer {
  const input = Buffer.from(payload);
  const minimumLength = PACKED_WEBP_HEADER_LENGTH + PACKED_WEBP_TAG_LENGTH;

  if (input.length < minimumLength) {
    throw new Error("Packed WebP payload is truncated");
  }

  const version = input[0];
  if (version !== PACKED_WEBP_VERSION) {
    throw new Error(`Unsupported packed WebP payload version ${version}`);
  }

  const ciphertextLength = input.readUInt32BE(1 + PACKED_WEBP_IV_LENGTH);
  const expectedLength = minimumLength + ciphertextLength;
  if (input.length !== expectedLength) {
    throw new Error("Packed WebP payload length is invalid");
  }

  const header = input.subarray(0, PACKED_WEBP_HEADER_LENGTH);
  const tag = input.subarray(PACKED_WEBP_HEADER_LENGTH, minimumLength);
  const ciphertext = input.subarray(minimumLength);
  const expectedTag = createPackedTag(key, header, ciphertext);

  if (!timingSafeEqual(tag, expectedTag)) {
    throw new Error("Packed WebP payload authentication failed");
  }

  const iv = header.subarray(1, 1 + PACKED_WEBP_IV_LENGTH);
  const decipher = createDecipheriv("aes-256-ctr", derivePackedKey("enc", key), iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function appendPackedWebpChunk(webp: Uint8Array, payload: Uint8Array): Buffer {
  const input = Buffer.from(webp);
  assertWebpRiff(input);

  const chunk = Buffer.alloc(8 + payload.length + (payload.length % 2));
  chunk.write(PACKED_WEBP_CHUNK_TYPE, 0, "ascii");
  chunk.writeUInt32LE(payload.length, 4);
  Buffer.from(payload).copy(chunk, 8);

  const output = Buffer.concat([input, chunk]);
  output.writeUInt32LE(output.length - 8, 4);
  return output;
}

export function extractPackedWebpChunk(webp: Uint8Array): Buffer {
  const input = Buffer.from(webp);
  assertWebpRiff(input);

  let offset = RIFF_HEADER_LENGTH;
  while (offset + 8 <= input.length) {
    const chunkType = input.toString("ascii", offset, offset + 4);
    const chunkLength = input.readUInt32LE(offset + 4);
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + chunkLength;

    if (payloadEnd > input.length) {
      throw new Error("WebP RIFF chunk is truncated");
    }

    if (chunkType === PACKED_WEBP_CHUNK_TYPE) {
      return Buffer.from(input.subarray(payloadStart, payloadEnd));
    }

    offset = payloadEnd + (chunkLength % 2);
  }

  throw new Error("Packed WebP payload chunk not found");
}

export function buildRowPermutation(numRows: number, seed: number): Uint32Array {
  const permutation = new Uint32Array(numRows);
  const rand = mulberry32(seed);

  for (let index = 0; index < numRows; index += 1) {
    permutation[index] = index;
  }

  for (let index = numRows - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rand() * (index + 1));
    const current = permutation[index];
    permutation[index] = permutation[swapIndex];
    permutation[swapIndex] = current;
  }

  return permutation;
}

export const TILE_SIZE = 32;

interface TilePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function buildTilePermutation(
  width: number,
  height: number,
  tileSize: number,
  seed: number,
): Uint32Array {
  const tiles = buildTilePositions(width, height, tileSize);
  const permutation = new Uint32Array(tiles.length);
  const tileGroups = new Map<string, number[]>();

  for (let index = 0; index < tiles.length; index += 1) {
    permutation[index] = index;

    const tile = tiles[index];
    const groupKey = `${tile.width}x${tile.height}`;
    const group = tileGroups.get(groupKey);
    if (group) {
      group.push(index);
    } else {
      tileGroups.set(groupKey, [index]);
    }
  }

  for (const [groupKey, tileIndexes] of tileGroups) {
    const groupPermutation = buildRowPermutation(tileIndexes.length, seed ^ cyrb128(groupKey));
    for (let destinationIndex = 0; destinationIndex < tileIndexes.length; destinationIndex += 1) {
      permutation[tileIndexes[destinationIndex]] = tileIndexes[groupPermutation[destinationIndex]];
    }
  }

  return permutation;
}

export function shuffleTilesRgba(
  input: Uint8Array,
  width: number,
  height: number,
  channels: number,
  key: string,
  tileSize = TILE_SIZE,
): Buffer {
  const rowByteLength = width * channels;
  assertRawImageLength(input, rowByteLength, height);

  const output = Buffer.alloc(input.length);
  const tiles = buildTilePositions(width, height, tileSize);
  const permutation = buildTilePermutation(width, height, tileSize, cyrb128(key));

  for (let destinationTileIndex = 0; destinationTileIndex < tiles.length; destinationTileIndex += 1) {
    copyTile(
      input,
      output,
      tiles[permutation[destinationTileIndex]],
      tiles[destinationTileIndex],
      rowByteLength,
      channels,
    );
  }

  return output;
}

export function unshuffleTilesRgba(
  input: Uint8Array,
  width: number,
  height: number,
  channels: number,
  key: string,
  tileSize = TILE_SIZE,
): Buffer {
  const rowByteLength = width * channels;
  assertRawImageLength(input, rowByteLength, height);

  const output = Buffer.alloc(input.length);
  const tiles = buildTilePositions(width, height, tileSize);
  const permutation = buildTilePermutation(width, height, tileSize, cyrb128(key));

  for (let shuffledTileIndex = 0; shuffledTileIndex < tiles.length; shuffledTileIndex += 1) {
    copyTile(
      input,
      output,
      tiles[shuffledTileIndex],
      tiles[permutation[shuffledTileIndex]],
      rowByteLength,
      channels,
    );
  }

  return output;
}

export function shuffleRowsRgba(
  input: Uint8Array,
  width: number,
  height: number,
  channels: number,
  key: string,
): Buffer {
  const rowByteLength = width * channels;
  assertRawImageLength(input, rowByteLength, height);

  const output = Buffer.alloc(input.length);
  const permutation = buildRowPermutation(height, cyrb128(key));

  for (let destinationRow = 0; destinationRow < height; destinationRow += 1) {
    const sourceRow = permutation[destinationRow];
    output.set(
      input.subarray(sourceRow * rowByteLength, (sourceRow + 1) * rowByteLength),
      destinationRow * rowByteLength,
    );
  }

  return output;
}

export function unshuffleRowsRgba(
  input: Uint8Array,
  width: number,
  height: number,
  channels: number,
  key: string,
): Buffer {
  const rowByteLength = width * channels;
  assertRawImageLength(input, rowByteLength, height);

  const output = Buffer.alloc(input.length);
  const permutation = buildRowPermutation(height, cyrb128(key));

  for (let shuffledRow = 0; shuffledRow < height; shuffledRow += 1) {
    const originalRow = permutation[shuffledRow];
    output.set(
      input.subarray(shuffledRow * rowByteLength, (shuffledRow + 1) * rowByteLength),
      originalRow * rowByteLength,
    );
  }

  return output;
}

function buildTilePositions(width: number, height: number, tileSize: number): TilePosition[] {
  const tiles: TilePosition[] = [];

  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      tiles.push({
        x,
        y,
        width: Math.min(tileSize, width - x),
        height: Math.min(tileSize, height - y),
      });
    }
  }

  return tiles;
}

function copyTile(
  input: Uint8Array,
  output: Buffer,
  source: TilePosition,
  destination: TilePosition,
  rowByteLength: number,
  channels: number,
): void {
  const bytesPerTileRow = source.width * channels;

  for (let row = 0; row < source.height; row += 1) {
    const sourceStart = (source.y + row) * rowByteLength + source.x * channels;
    const destinationStart = (destination.y + row) * rowByteLength + destination.x * channels;
    output.set(input.subarray(sourceStart, sourceStart + bytesPerTileRow), destinationStart);
  }
}

function assertRawImageLength(input: Uint8Array, rowByteLength: number, height: number): void {
  const expectedLength = rowByteLength * height;
  if (input.length !== expectedLength) {
    throw new Error(`Expected raw image buffer length ${expectedLength}, received ${input.length}`);
  }
}

function derivePackedKey(purpose: "enc" | "auth", key: string): Buffer {
  return createHash("sha256")
    .update(`truyendrive-packed-${purpose}:`)
    .update(key)
    .digest();
}

function createPackedTag(key: string, header: Uint8Array, ciphertext: Uint8Array): Buffer {
  return createHmac("sha256", derivePackedKey("auth", key))
    .update(header)
    .update(ciphertext)
    .digest();
}

function assertWebpRiff(input: Buffer): void {
  if (
    input.length < RIFF_HEADER_LENGTH ||
    input.toString("ascii", 0, 4) !== "RIFF" ||
    input.toString("ascii", 8, 12) !== "WEBP"
  ) {
    throw new Error("Expected a WebP RIFF file");
  }
}
