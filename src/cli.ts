#!/usr/bin/env node

import { stat } from "node:fs/promises";
import os from "node:os";
import { resolve } from "node:path";

import { Command, InvalidArgumentError } from "commander";

import { processUnits } from "./processor";
import { DEFAULT_KEY, type CliOptions, type EncryptionMethod, type ProcessingMode } from "./types";
import { discoverUnits } from "./units";

const DEFAULT_MODE: ProcessingMode = "folder";
const DEFAULT_ENCRYPTION: EncryptionMethod = "shuffle";
const ENCRYPT_DESTINATION_SUBPATH = "truyendrive";
const DECRYPT_DESTINATION_SUBPATH = "decrypted";

export function getDefaultBatchSize(): number {
  return Math.max(1, Math.min(os.availableParallelism(), 8));
}

export function parseCliArgs(argv: string[]): CliOptions {
  const { overwrite, argv: sanitizedArgv } = extractOverwriteFlag(argv);
  const command = new Command();

  command
    .name("truyendrive-cli")
    .argument("<directory>", "Source directory to process")
    .option("--mode <mode>", "Processing mode: folder or subfolder", DEFAULT_MODE)
    .option(
      "--encryption <method>",
      "Encryption method: shuffle (preserves file size) or noise (legacy)",
      DEFAULT_ENCRYPTION,
    )
    .option(
      "--decrypt",
      "Reverse encryption for an already-encrypted truyendrive/ source directory",
      false,
    )
    .option("--key <key>", "Encryption key", DEFAULT_KEY)
    .option("--copy-other-files", "Copy non-image files to destination", true)
    .option("--no-copy-other-files", "Do not copy non-image files to destination")
    .option(
      "--generate-password-file",
      "Generate .password.<key>.truyendrive in destination if none found in source",
      true,
    )
    .option(
      "--no-generate-password-file",
      "Do not generate .password.<key>.truyendrive in destination",
    )
    .option(
      "--batch-size <number>",
      "Maximum concurrent image jobs within a processing unit",
      parsePositiveInteger,
      getDefaultBatchSize(),
    )
    .allowExcessArguments(false)
    .exitOverride();

  command.parse(sanitizedArgv, { from: "user" });

  const [directory] = command.processedArgs as [string];
  const options = command.opts<{
    mode: string;
    encryption: string;
    decrypt: boolean;
    key: string;
    batchSize: number;
    copyOtherFiles: boolean;
    generatePasswordFile: boolean;
  }>();

  if (options.mode !== "folder" && options.mode !== "subfolder") {
    throw new InvalidArgumentError(`Expected --mode to be "folder" or "subfolder", received "${options.mode}"`);
  }

  if (options.encryption !== "shuffle" && options.encryption !== "noise") {
    throw new InvalidArgumentError(
      `Expected --encryption to be "shuffle" or "noise", received "${options.encryption}"`,
    );
  }

  return {
    directory: resolve(directory),
    action: options.decrypt ? "decrypt" : "encrypt",
    mode: options.mode,
    encryption: options.encryption,
    key: options.key,
    batchSize: options.batchSize,
    overwrite,
    copyOtherFiles: options.copyOtherFiles,
    generatePasswordFile: options.generatePasswordFile,
  };
}

export async function runCli(
  argv: string[],
  logger: (message: string) => void = console.log,
  errorLogger: (message: string) => void = console.error,
): Promise<number> {
  try {
    const options = parseCliArgs(argv);
    await validateDirectory(options.directory);
    const destinationSubPath =
      options.action === "decrypt" ? DECRYPT_DESTINATION_SUBPATH : ENCRYPT_DESTINATION_SUBPATH;
    const units = await discoverUnits(options.directory, options.mode, destinationSubPath);
    const { hasFailures } = await processUnits(units, options, logger);
    return hasFailures ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errorLogger(message);
    return 1;
  }
}

async function validateDirectory(directory: string): Promise<void> {
  const directoryStat = await stat(directory);
  if (!directoryStat.isDirectory()) {
    throw new Error(`Expected directory path, received file: ${directory}`);
  }
}

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(`Expected a positive integer, received "${value}"`);
  }
  return parsed;
}

function extractOverwriteFlag(argv: string[]): { argv: string[]; overwrite: boolean } {
  let overwrite = false;
  const sanitized: string[] = [];

  for (const argument of argv) {
    if (argument === "--overwrite") {
      overwrite = true;
      continue;
    }

    if (argument === "--no-overwrite") {
      overwrite = false;
      continue;
    }

    sanitized.push(argument);
  }

  return { argv: sanitized, overwrite };
}

async function main(): Promise<void> {
  const exitCode = await runCli(process.argv.slice(2));
  process.exitCode = exitCode;
}

if (require.main === module) {
  void main();
}
