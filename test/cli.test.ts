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
    expect(parsed.compressionLevel).toBe(6);
    expect(parsed.effort).toBe(7);
    expect(parsed.ignoreAlpha).toBe(false);
    expect(parsed.losslessWebp).toBe(false);
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
      "--compression-level",
      "9",
      "--effort",
      "10",
      "--ignore-alpha",
      "--lossless-webp",
      "--copy-other-files",
      "--generate-password-file",
      "--overwrite",
    ]);

    expect(parsed.mode).toBe("subfolder");
    expect(parsed.encryption).toBe("noise");
    expect(parsed.key).toBe("secret");
    expect(parsed.batchSize).toBe(2);
    expect(parsed.compressionLevel).toBe(9);
    expect(parsed.effort).toBe(10);
    expect(parsed.ignoreAlpha).toBe(true);
    expect(parsed.losslessWebp).toBe(true);
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

  it("rejects invalid compression level", () => {
    expect(() => parseCliArgs(["./input", "--compression-level", "10"])).toThrow(
      'Expected --compression-level to be an integer from 0 to 9, received "10"',
    );
    expect(() => parseCliArgs(["./input", "--compression-level", "3.5"])).toThrow(
      'Expected --compression-level to be an integer from 0 to 9, received "3.5"',
    );
  });

  it("rejects invalid effort", () => {
    expect(() => parseCliArgs(["./input", "--effort", "0"])).toThrow(
      'Expected --effort to be an integer from 1 to 10, received "0"',
    );
    expect(() => parseCliArgs(["./input", "--effort", "11"])).toThrow(
      'Expected --effort to be an integer from 1 to 10, received "11"',
    );
    expect(() => parseCliArgs(["./input", "--effort", "3.5"])).toThrow(
      'Expected --effort to be an integer from 1 to 10, received "3.5"',
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
