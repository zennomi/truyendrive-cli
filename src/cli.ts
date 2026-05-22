#!/usr/bin/env node

import { stat } from "node:fs/promises";
import os from "node:os";
import { resolve } from "node:path";

import { Command, CommanderError, InvalidArgumentError, Option } from "commander";

import { processUnits } from "./processor";
import { DEFAULT_KEY, type CliOptions, type EncryptionMethod, type ProcessingMode } from "./types";
import { discoverUnits } from "./units";

const DEFAULT_MODE: ProcessingMode = "folder";
const DEFAULT_ENCRYPTION: EncryptionMethod = "scanline";
const DEFAULT_COMPRESSION_LEVEL = 6;
const DEFAULT_EFFORT = 7;
const ENCRYPT_DESTINATION_SUBPATH = "truyendrive";
const DECRYPT_DESTINATION_SUBPATH = "decrypted";

export function getDefaultBatchSize(): number {
  return Math.max(1, Math.min(os.availableParallelism(), 8));
}

export function parseCliArgs(argv: string[]): CliOptions {
  const encryptionExplicit = hasEncryptionFlag(argv);
  const command = new Command();

  command
    .name("truyendrive-cli")
    .argument("<directory>", "Source directory to process")
    .option("--mode <mode>", "Processing mode: folder or subfolder", DEFAULT_MODE)
    .option(
      "--encryption <method>",
      "Encryption method: scanline or noise",
      DEFAULT_ENCRYPTION,
    )
    .option(
      "--decrypt",
      "Reverse encryption for an already-encrypted truyendrive/ source directory",
      false,
    )
    .option("--key <key>", "Encryption key", DEFAULT_KEY)
    .option("--copy-other-files", "Copy non-image files to destination", true)
    .addOption(new Option("--no-copy-other-files").hideHelp())
    .option(
      "--no-generate-password-file",
      "Do not generate .password.<key>.<method>.truyendrive in destination",
    )
    .option(
      "--batch-size <number>",
      "Maximum concurrent image jobs within a processing unit",
      parsePositiveInteger,
      getDefaultBatchSize(),
    )
    .option(
      "--compression-level <number>",
      "PNG compression level (0 = fastest/largest ... 9 = slowest/smallest)",
      parseCompressionLevel,
      DEFAULT_COMPRESSION_LEVEL,
    )
    .option(
      "--effort <number>",
      "PNG encoder effort from 1 to 10 (higher can improve compression)",
      parseEffort,
      DEFAULT_EFFORT,
    )
    .option("--overwrite", "Overwrite existing files in the destination directory", false)
    .addOption(new Option("--no-overwrite").hideHelp())
    .allowExcessArguments(false)
    .exitOverride();

  command.parse(argv, { from: "user" });

  const [directory] = command.processedArgs as [string];
  const options = command.opts<{
    mode: string;
    encryption: string;
    decrypt: boolean;
    key: string;
    batchSize: number;
    copyOtherFiles: boolean;
    generatePasswordFile: boolean;
    compressionLevel: number;
    effort: number;
    overwrite: boolean;
  }>();

  if (options.mode !== "folder" && options.mode !== "subfolder") {
    throw new InvalidArgumentError(`Expected --mode to be "folder" or "subfolder", received "${options.mode}"`);
  }

  if (!isEncryptionMethod(options.encryption)) {
    throw new InvalidArgumentError(
      `Expected --encryption to be "scanline" or "noise", received "${options.encryption}"`,
    );
  }

  return {
    directory: resolve(directory),
    action: options.decrypt ? "decrypt" : "encrypt",
    mode: options.mode,
    encryption: options.encryption,
    encryptionExplicit,
    key: options.key,
    batchSize: options.batchSize,
    overwrite: options.overwrite,
    copyOtherFiles: options.copyOtherFiles,
    generatePasswordFile: options.generatePasswordFile,
    compressionLevel: options.compressionLevel,
    effort: options.effort,
  };
}

function isEncryptionMethod(value: string): value is EncryptionMethod {
  return value === "scanline" || value === "noise";
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
    if (error instanceof CommanderError && error.code === "commander.helpDisplayed") {
      return 0;
    }

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

function parseCompressionLevel(value: string): number {
  if (!/^[0-9]$/.test(value)) {
    throw new InvalidArgumentError(
      `Expected --compression-level to be an integer from 0 to 9, received "${value}"`,
    );
  }
  return Number(value);
}

function parseEffort(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
    throw new InvalidArgumentError(
      `Expected --effort to be an integer from 1 to 10, received "${value}"`,
    );
  }
  return parsed;
}

function hasEncryptionFlag(argv: string[]): boolean {
  return argv.some((argument) => argument === "--encryption" || argument.startsWith("--encryption="));
}

async function main(): Promise<void> {
  const exitCode = await runCli(process.argv.slice(2));
  process.exitCode = exitCode;
}

if (require.main === module) {
  void main();
}
