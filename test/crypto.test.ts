import { describe, expect, it } from "vitest";

import { buildRowPermutation, cyrb128, shuffleRowsRgba, unshuffleRowsRgba, xorNoiseRgba } from "../src/crypto";

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

function chunkRows(input: Uint8Array, rowByteLength: number): number[][] {
  const rows: number[][] = [];
  for (let index = 0; index < input.length; index += rowByteLength) {
    rows.push(Array.from(input.subarray(index, index + rowByteLength)));
  }
  return rows;
}
