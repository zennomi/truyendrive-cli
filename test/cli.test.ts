import { describe, expect, it, vi } from "vitest";

import { getDefaultBatchSize, parseCliArgs, runCli } from "../src/cli";

describe("parseCliArgs", () => {
  it("applies defaults", () => {
    const parsed = parseCliArgs(["./input"]);

    expect(parsed.action).toBe("encrypt");
    expect(parsed.mode).toBe("folder");
    expect(parsed.encryption).toBe("shuffle");
    expect(parsed.key).toBe("truyendrive");
    expect(parsed.batchSize).toBe(getDefaultBatchSize());
    expect(parsed.overwrite).toBe(false);
    expect(parsed.copyOtherFiles).toBe(true);
    expect(parsed.generatePasswordFile).toBe(true);
  });

  it("sets decrypt action when requested", () => {
    const parsed = parseCliArgs(["./input", "--decrypt"]);

    expect(parsed.action).toBe("decrypt");
  });

  it("accepts overwrite, mode, and feature flags", () => {
    const parsed = parseCliArgs([
      "./input",
      "--mode",
      "subfolder",
      "--key",
      "secret",
      "--encryption",
      "noise",
      "--batch-size",
      "2",
      "--copy-other-files",
      "--generate-password-file",
      "--overwrite",
    ]);

    expect(parsed.mode).toBe("subfolder");
    expect(parsed.encryption).toBe("noise");
    expect(parsed.key).toBe("secret");
    expect(parsed.batchSize).toBe(2);
    expect(parsed.overwrite).toBe(true);
    expect(parsed.copyOtherFiles).toBe(true);
    expect(parsed.generatePasswordFile).toBe(true);
  });

  it("accepts no-copy-other-files flag", () => {
    const parsed = parseCliArgs(["./input", "--no-copy-other-files"]);

    expect(parsed.copyOtherFiles).toBe(false);
  });

  it("accepts no-generate-password-file flag", () => {
    const parsed = parseCliArgs(["./input", "--no-generate-password-file"]);

    expect(parsed.generatePasswordFile).toBe(false);
  });

  it("rejects invalid batch size", () => {
    expect(() => parseCliArgs(["./input", "--batch-size", "0"])).toThrow(
      'Expected a positive integer, received "0"',
    );
  });

  it("rejects invalid encryption method", () => {
    expect(() => parseCliArgs(["./input", "--encryption", "unknown"])).toThrow(
      'Expected --encryption to be "shuffle" or "noise", received "unknown"',
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
