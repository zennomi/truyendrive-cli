#!/usr/bin/env node

import { stat } from "node:fs/promises";
import os from "node:os";
import { resolve } from "node:path";

import { Command, InvalidArgumentError } from "commander";

import { processUnits } from "./processor";
import type { CliOptions, ProcessingMode } from "./types";
import { discoverUnits } from "./units";

const DEFAULT_KEY = "truyendrive";
const DEFAULT_MODE: ProcessingMode = "folder";

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
    .option("--key <key>", "XOR-noise key", DEFAULT_KEY)
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
    key: string;
    batchSize: number;
  }>();

  if (options.mode !== "folder" && options.mode !== "subfolder") {
    throw new InvalidArgumentError(`Expected --mode to be "folder" or "subfolder", received "${options.mode}"`);
  }

  return {
    directory: resolve(directory),
    mode: options.mode,
    key: options.key,
    batchSize: options.batchSize,
    overwrite,
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
    const units = await discoverUnits(options.directory, options.mode);
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
