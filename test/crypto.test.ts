import { describe, expect, it } from "vitest";

import {
  TILE_SIZE,
  buildRowPermutation,
  buildTilePermutation,
  cyrb128,
  shuffleRowsRgba,
  shuffleTilesRgba,
  unshuffleRowsRgba,
  unshuffleTilesRgba,
  xorNoiseRgba,
} from "../src/crypto";

describe("xorNoiseRgba", () => {
  it("is reversible with the same key", () => {
    const source = Buffer.from([
      10, 20, 30, 255,
      40, 50, 60, 128,
      70, 80, 90, 64,
    ]);

    const encrypted = xorNoiseRgba(source, "secret");
    const decrypted = xorNoiseRgba(encrypted, "secret");

    expect(Buffer.compare(decrypted, source)).toBe(0);
  });

  it("preserves alpha bytes", () => {
    const source = Buffer.from([
      1, 2, 3, 0,
      4, 5, 6, 127,
      7, 8, 9, 255,
    ]);

    const encrypted = xorNoiseRgba(source, "secret");

    expect(encrypted[3]).toBe(0);
    expect(encrypted[7]).toBe(127);
    expect(encrypted[11]).toBe(255);
  });
});

describe("row shuffle encryption", () => {
  it("builds a deterministic row permutation", () => {
    const first = buildRowPermutation(8, 1234);
    const second = buildRowPermutation(8, 1234);

    expect(Array.from(first)).toEqual(Array.from(second));
    expect(Array.from(first).sort((left, right) => left - right)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("shuffles rows without changing bytes inside a row", () => {
    const source = Buffer.from([
      10, 11, 12, 255,
      20, 21, 22, 255,
      30, 31, 32, 255,
      40, 41, 42, 255,
    ]);

    const shuffled = shuffleRowsRgba(source, 1, 4, 4, "secret");
    const permutation = buildRowPermutation(4, cyrb128("secret"));
    const rows = Array.from(permutation, (row) => Array.from(source.subarray(row * 4, row * 4 + 4)));

    expect(chunkRows(shuffled, 4)).toEqual(rows);
  });

  it("is reversible with the same key", () => {
    const source = Buffer.from([
      10, 11, 12, 255,
      20, 21, 22, 128,
      30, 31, 32, 64,
      40, 41, 42, 0,
    ]);

    const encrypted = shuffleRowsRgba(source, 1, 4, 4, "secret");
    const decrypted = unshuffleRowsRgba(encrypted, 1, 4, 4, "secret");

    expect(Buffer.compare(decrypted, source)).toBe(0);
  });
});

describe("tile shuffle encryption", () => {
  it("builds a deterministic tile permutation", () => {
    const first = buildTilePermutation(64, 64, TILE_SIZE, 1234);
    const second = buildTilePermutation(64, 64, TILE_SIZE, 1234);

    expect(Array.from(first)).toEqual(Array.from(second));
    expect(Array.from(first).sort((left, right) => left - right)).toEqual([0, 1, 2, 3]);
  });

  it("shuffles 32x32 tiles without changing pixels inside a tile", () => {
    const source = createTileIdRgba(64, 64, TILE_SIZE);
    const shuffled = shuffleTilesRgba(source, 64, 64, 4, "secret");
    const permutation = buildTilePermutation(64, 64, TILE_SIZE, cyrb128("secret"));

    for (let destinationTileIndex = 0; destinationTileIndex < permutation.length; destinationTileIndex += 1) {
      expectTileToMatchSourceTile(
        shuffled,
        source,
        64,
        4,
        TILE_SIZE,
        permutation[destinationTileIndex],
        destinationTileIndex,
      );
    }
  });

  it("is reversible with the same key", () => {
    const source = createCoordinateRgba(70, 65);

    const encrypted = shuffleTilesRgba(source, 70, 65, 4, "secret");
    const decrypted = unshuffleTilesRgba(encrypted, 70, 65, 4, "secret");

    expect(Buffer.compare(decrypted, source)).toBe(0);
  });

  it("shuffles only compatible partial edge tile sizes", () => {
    const permutation = buildTilePermutation(65, 65, TILE_SIZE, cyrb128("secret"));
    const tiles = buildTestTilePositions(65, 65, TILE_SIZE);

    for (let destinationTileIndex = 0; destinationTileIndex < permutation.length; destinationTileIndex += 1) {
      const destination = tiles[destinationTileIndex];
      const source = tiles[permutation[destinationTileIndex]];

      expect(source.width).toBe(destination.width);
      expect(source.height).toBe(destination.height);
    }
  });
});

function chunkRows(input: Uint8Array, rowByteLength: number): number[][] {
  const rows: number[][] = [];
  for (let index = 0; index < input.length; index += rowByteLength) {
    rows.push(Array.from(input.subarray(index, index + rowByteLength)));
  }
  return rows;
}

function createTileIdRgba(width: number, height: number, tileSize: number): Buffer {
  const output = Buffer.alloc(width * height * 4);
  const tilesPerRow = Math.ceil(width / tileSize);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tileIndex = Math.floor(y / tileSize) * tilesPerRow + Math.floor(x / tileSize);
      const offset = (y * width + x) * 4;
      output[offset] = tileIndex;
      output[offset + 1] = x % 256;
      output[offset + 2] = y % 256;
      output[offset + 3] = 255;
    }
  }

  return output;
}

function createCoordinateRgba(width: number, height: number): Buffer {
  const output = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      output[offset] = x % 256;
      output[offset + 1] = y % 256;
      output[offset + 2] = (x + y) % 256;
      output[offset + 3] = 255;
    }
  }

  return output;
}

function expectTileToMatchSourceTile(
  actual: Uint8Array,
  expectedSource: Uint8Array,
  width: number,
  channels: number,
  tileSize: number,
  sourceTileIndex: number,
  destinationTileIndex: number,
): void {
  const tilesPerRow = Math.ceil(width / tileSize);
  const sourceTileX = (sourceTileIndex % tilesPerRow) * tileSize;
  const sourceTileY = Math.floor(sourceTileIndex / tilesPerRow) * tileSize;
  const destinationTileX = (destinationTileIndex % tilesPerRow) * tileSize;
  const destinationTileY = Math.floor(destinationTileIndex / tilesPerRow) * tileSize;

  for (let row = 0; row < tileSize; row += 1) {
    const sourceStart = ((sourceTileY + row) * width + sourceTileX) * channels;
    const destinationStart = ((destinationTileY + row) * width + destinationTileX) * channels;
    expect(Array.from(actual.subarray(destinationStart, destinationStart + tileSize * channels))).toEqual(
      Array.from(expectedSource.subarray(sourceStart, sourceStart + tileSize * channels)),
    );
  }
}

function buildTestTilePositions(
  width: number,
  height: number,
  tileSize: number,
): Array<{ width: number; height: number }> {
  const tiles: Array<{ width: number; height: number }> = [];

  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      tiles.push({
        width: Math.min(tileSize, width - x),
        height: Math.min(tileSize, height - y),
      });
    }
  }

  return tiles;
}
