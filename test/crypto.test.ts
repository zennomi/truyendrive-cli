import { describe, expect, it } from "vitest";

import { xorNoiseRgba } from "../src/crypto";

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
