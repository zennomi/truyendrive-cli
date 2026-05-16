import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ProgressBar } from "../src/progress";

const stdoutColumnsDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "columns");

beforeEach(() => {
  Object.defineProperty(process.stdout, "columns", {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  if (stdoutColumnsDescriptor) {
    Object.defineProperty(process.stdout, "columns", stdoutColumnsDescriptor);
  } else {
    Reflect.deleteProperty(process.stdout, "columns");
  }
});

describe("ProgressBar", () => {
  it("renders TTY progress updates on a single line", () => {
    const stream = createMockStream({ isTTY: true, columns: 80 });
    const bar = new ProgressBar("biya", 100, stream);

    bar.update(60);

    expect(stream.output()).toBe(
      `\r\x1b[Kbiya [${"█".repeat(24)}${"░".repeat(16)}] 60/100 (60%)`,
    );
  });

  it("uses plain-text lines when the stream is not a TTY", () => {
    const stream = createMockStream({ isTTY: false });
    const bar = new ProgressBar("biya", 2, stream);

    bar.update(1);
    bar.update(2);
    bar.finish();

    expect(stream.output()).toBe("biya: 1/2 (50%)\nbiya: 2/2 (100%)\n");
  });

  it("supports count labels for aggregate progress", () => {
    const stream = createMockStream({ isTTY: true, columns: 80 });
    const bar = new ProgressBar("[overall]", 10, stream, "units");

    bar.update(2);

    expect(stream.output()).toBe(
      `\r\x1b[K[overall] [${"█".repeat(8)}${"░".repeat(32)}] 2/10 units`,
    );
  });

  it("finishes TTY output with a newline after the final state", () => {
    const stream = createMockStream({ isTTY: true, columns: 80 });
    const bar = new ProgressBar("biya", 2, stream);

    bar.update(1);
    bar.finish();

    expect(stream.output()).toBe(
      `\r\x1b[Kbiya [${"█".repeat(20)}${"░".repeat(20)}] 1/2 (50%)` +
        `\r\x1b[Kbiya [${"█".repeat(40)}] 2/2 (100%)\n`,
    );
  });

  it("clears TTY output with carriage return and erase-line escapes", () => {
    const stream = createMockStream({ isTTY: true, columns: 80 });
    const bar = new ProgressBar("biya", 1, stream);

    bar.update(0);
    bar.clear();

    expect(stream.output().endsWith("\r\x1b[K")).toBe(true);
  });
});

function createMockStream({
  isTTY,
  columns,
}: {
  isTTY: boolean;
  columns?: number;
}): NodeJS.WriteStream & { output: () => string } {
  const chunks: string[] = [];

  return {
    isTTY,
    columns,
    write(chunk: string | Uint8Array): boolean {
      chunks.push(String(chunk));
      return true;
    },
    output(): string {
      return chunks.join("");
    },
  } as NodeJS.WriteStream & { output: () => string };
}
