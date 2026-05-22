import { describe, expect, it } from "vitest";

import {
  scanlineScrambleRgba,
  scanlineUnscrambleRgba,
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

describe("scanline encryption", () => {
  it("is deterministic with the same key and dimensions", () => {
    const source = Buffer.from([
      10, 11, 12, 255, 20, 21, 22, 255, 30, 31, 32, 255,
      40, 41, 42, 255, 50, 51, 52, 255, 60, 61, 62, 255,
    ]);

    const first = scanlineScrambleRgba(source, 3, 2, 4, "secret");
    const second = scanlineScrambleRgba(source, 3, 2, 4, "secret");

    expect(Array.from(first)).toEqual(Array.from(second));
  });

  it("is reversible with the same key", () => {
    const source = Buffer.from([
      10, 11, 12, 255, 20, 21, 22, 255, 30, 31, 32, 255,
      40, 41, 42, 255, 50, 51, 52, 128, 60, 61, 62, 0,
    ]);

    const encrypted = scanlineScrambleRgba(source, 3, 2, 4, "secret");
    const decrypted = scanlineUnscrambleRgba(encrypted, 3, 2, 4, "secret");

    expect(Buffer.compare(decrypted, source)).toBe(0);
  });
});
