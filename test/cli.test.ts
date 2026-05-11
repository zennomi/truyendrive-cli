import { describe, expect, it, vi } from "vitest";

import { getDefaultBatchSize, parseCliArgs, runCli } from "../src/cli";

describe("parseCliArgs", () => {
  it("applies defaults", () => {
    const parsed = parseCliArgs(["./input"]);

    expect(parsed.mode).toBe("folder");
    expect(parsed.key).toBe("truyendrive");
    expect(parsed.batchSize).toBe(getDefaultBatchSize());
    expect(parsed.overwrite).toBe(false);
  });

  it("accepts overwrite and mode flags", () => {
    const parsed = parseCliArgs([
      "./input",
      "--mode",
      "subfolder",
      "--key",
      "secret",
      "--batch-size",
      "2",
      "--overwrite",
    ]);

    expect(parsed.mode).toBe("subfolder");
    expect(parsed.key).toBe("secret");
    expect(parsed.batchSize).toBe(2);
    expect(parsed.overwrite).toBe(true);
  });

  it("rejects invalid batch size", () => {
    expect(() => parseCliArgs(["./input", "--batch-size", "0"])).toThrow(
      'Expected a positive integer, received "0"',
    );
  });
});

describe("runCli", () => {
  it("returns exit code 1 for missing directories", async () => {
    const logger = vi.fn();
    const errorLogger = vi.fn();

    const exitCode = await runCli(["/definitely/missing"], logger, errorLogger);

    expect(exitCode).toBe(1);
    expect(errorLogger).toHaveBeenCalledTimes(1);
  });
});
