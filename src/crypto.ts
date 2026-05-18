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

function assertRawImageLength(input: Uint8Array, rowByteLength: number, height: number): void {
  const expectedLength = rowByteLength * height;
  if (input.length !== expectedLength) {
    throw new Error(`Expected raw image buffer length ${expectedLength}, received ${input.length}`);
  }
}
