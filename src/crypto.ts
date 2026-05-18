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
