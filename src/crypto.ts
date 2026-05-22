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

export function scanlineScrambleRgba(
  input: Uint8Array,
  width: number,
  height: number,
  channels: number,
  key: string,
): Buffer {
  return transformScanlinesRgba(input, width, height, channels, key, "scramble");
}

export function scanlineUnscrambleRgba(
  input: Uint8Array,
  width: number,
  height: number,
  channels: number,
  key: string,
): Buffer {
  return transformScanlinesRgba(input, width, height, channels, key, "unscramble");
}

function transformScanlinesRgba(
  input: Uint8Array,
  width: number,
  height: number,
  channels: number,
  key: string,
  direction: "scramble" | "unscramble",
): Buffer {
  const rowByteLength = width * channels;
  assertRawImageLength(input, rowByteLength, height);

  const output = Buffer.alloc(input.length);
  const rand = mulberry32(cyrb128(`${key}:${width}x${height}:${channels}:scanline`));

  for (let row = 0; row < height; row += 1) {
    const offset = width === 0 ? 0 : Math.floor(rand() * width);
    const reverse = rand() >= 0.5;

    for (let destinationColumn = 0; destinationColumn < width; destinationColumn += 1) {
      const transformedColumn =
        direction === "scramble"
          ? destinationColumn
          : reverse
            ? width - 1 - destinationColumn
            : destinationColumn;
      const rolledColumn =
        direction === "scramble"
          ? (destinationColumn - offset + width) % width
          : (transformedColumn + offset) % width;
      const sourceColumn =
        direction === "scramble" && reverse
          ? width - 1 - rolledColumn
          : rolledColumn;

      output.set(
        input.subarray(
          row * rowByteLength + sourceColumn * channels,
          row * rowByteLength + (sourceColumn + 1) * channels,
        ),
        row * rowByteLength + destinationColumn * channels,
      );
    }
  }

  return output;
}

function assertRawImageLength(input: Uint8Array, rowByteLength: number, height: number): void {
  const expectedLength = rowByteLength * height;
  if (input.length !== expectedLength) {
    throw new Error(`Expected raw image buffer length ${expectedLength}, received ${input.length}`);
  }
}
